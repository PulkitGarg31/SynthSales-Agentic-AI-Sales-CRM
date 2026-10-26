import csv
import io
import re

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.agents.base import AGENT_REGISTRY
from app.agents.orchestrator import (
    RUNNABLE_KEYS,
    run_agent_for_campaign,
    run_campaign_pipeline,
)
from app.api.deps import get_current_user
from app.api.pagination import Page, paginate
from app.core.database import SessionLocal, get_db
from app.core.ratelimit import enforce
from app.models import (
    AgentConfig,
    Campaign,
    CampaignUpload,
    Company,
    Contact,
    EmailDraft,
    Meeting,
    Thread,
    User,
    utcnow,
)
from app.schemas import (
    CampaignCreate,
    CampaignCsvOut,
    CampaignDetailsOut,
    CampaignOut,
    CampaignUpdate,
    CompanyOut,
    PipelineAgentOut,
    SnapshotStatusOut,
)
from app.services import snapshots
from app.services.access import GATED_AGENT_KEYS
from app.services.events import add_log, add_notification
from app.services.serializers import campaign_rollups, company_out
from app.services.snapshots import ConversationActive

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


def _owned(db: Session, user: User, campaign_id: int) -> Campaign:
    c = db.get(Campaign, campaign_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return c


@router.get("", response_model=list[CampaignOut])
def list_campaigns(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(Campaign)
        .filter(Campaign.owner_id == user.id)
        .order_by(Campaign.created_at.desc())
        .all()
    )
    return [campaign_rollups(db, c) for c in rows]


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = Campaign(owner_id=user.id, status="Draft", **payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    add_log(db, user.id, "Campaign", f"Created campaign '{c.name}'.")
    return campaign_rollups(db, c)


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    return campaign_rollups(db, _owned(db, user, campaign_id))


@router.get("/{campaign_id}/details", response_model=CampaignDetailsOut)
def get_campaign_details(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Everything the user entered in the wizard (read-only Details view)."""
    return _owned(db, user, campaign_id)


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _owned(db, user, campaign_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return campaign_rollups(db, c)


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    c = _owned(db, user, campaign_id)
    db.delete(c)
    db.commit()


@router.post("/{campaign_id}/duplicate", response_model=CampaignOut, status_code=201)
def duplicate_campaign(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    src = _owned(db, user, campaign_id)
    data = {
        col.name: getattr(src, col.name)
        for col in Campaign.__table__.columns
        if col.name not in ("id", "created_at", "status")
    }
    data["name"] = f"{src.name} (copy)"
    dup = Campaign(status="Draft", **data)
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return campaign_rollups(db, dup)


@router.get("/{campaign_id}/companies", response_model=list[CompanyOut])
def campaign_companies(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: Page = Depends(),
):
    _owned(db, user, campaign_id)
    q = (
        db.query(Company)
        .filter(Company.campaign_id == campaign_id)
        .order_by(Company.rank, Company.name)
    )
    rows = paginate(q, page).all()
    return [company_out(db, c) for c in rows]


# Server-side upload limits. The frontend enforces the same 20 MB, but those
# checks are cosmetic — the API is the source of truth and must not trust them.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UPLOAD_ROWS = 50_000
MAX_UPLOAD_COLS = 100


def _normalize_domain(raw: str) -> str:
    """Reduce a website/URL cell to a bare hostname — strip scheme, path, query,
    fragment, userinfo and port. Keeps SSRF-shaped values (``user@host``,
    ``host:port/path``) out of the DB and away from the enrichment fetcher."""
    d = (raw or "").strip().lower()
    for pre in ("https://", "http://"):
        if d.startswith(pre):
            d = d[len(pre):]
    d = d.split("/")[0].split("?")[0].split("#")[0]
    d = d.split("@")[-1].split(":")[0]
    return d.strip().strip(".")


@router.post("/{campaign_id}/companies/upload")
async def upload_companies(
    campaign_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _owned(db, user, campaign_id)
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Upload a .csv file.")
    # Bounded, chunked read — never pull an unbounded body into memory.
    buf, total = [], 0
    while chunk := await file.read(64 * 1024):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="CSV is larger than 20 MB. Split it into smaller lists.",
            )
        buf.append(chunk)
    raw = b"".join(buf).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Empty or invalid CSV")
    if len(reader.fieldnames) > MAX_UPLOAD_COLS:
        raise HTTPException(status_code=400, detail="CSV has too many columns.")

    # Normalize header names.
    def pick(row: dict, *keys: str) -> str:
        for k in keys:
            for actual in row:
                if actual and actual.strip().lower() == k:
                    return (row[actual] or "").strip()
        return ""

    existing = {
        (co.name.lower(), co.domain.lower())
        for co in db.query(Company).filter(Company.campaign_id == c.id)
    }
    added = 0
    skipped = 0
    seen = 0
    for row in reader:
        seen += 1
        if seen > MAX_UPLOAD_ROWS:
            break  # cap the batch; ignore the rest rather than OOM/timeout
        # Truncate each cell to its DB column width so one oversized value can't
        # 500 the whole upload (Postgres rejects, not truncates, over-length text).
        name = pick(row, "company_name", "company", "name")[:200]
        if not name:
            skipped += 1
            continue
        domain = _normalize_domain(pick(row, "domain", "website", "url"))[:200]
        key = (name.lower(), domain.lower())
        if key in existing:
            skipped += 1
            continue
        existing.add(key)
        db.add(
            Company(
                campaign_id=c.id,
                name=name,
                domain=domain,
                industry=pick(row, "industry", "sector")[:120],
                location=pick(row, "country", "location", "region")[:120],
                status="Researching",
            )
        )
        added += 1
    # Keep the original file so the user can view/download it later; a
    # re-upload replaces it. Postgres text can't hold NUL bytes.
    upload = db.query(CampaignUpload).filter(CampaignUpload.campaign_id == c.id).first()
    if not upload:
        upload = CampaignUpload(campaign_id=c.id)
        db.add(upload)
    upload.filename = _safe_filename(file.filename or "", c.id)
    upload.content = raw.replace("\x00", "")
    upload.row_count = seen
    upload.size_bytes = total
    upload.uploaded_at = utcnow()
    db.commit()
    add_log(db, user.id, "Campaign", f"Uploaded {added} companies to '{c.name}' ({skipped} skipped).")
    return {"added": added, "skipped": skipped}


CSV_PREVIEW_ROWS = 500
CSV_PREVIEW_CELL = 500


def _safe_filename(name: str, campaign_id: int) -> str:
    """ASCII-only, header-safe filename (it's echoed in Content-Disposition)."""
    base = re.split(r"[\\/]", name)[-1]
    clean = re.sub(r"[^A-Za-z0-9._\- ()]+", "_", base).strip(" ._")[:200]
    if not clean:
        return f"campaign-{campaign_id}.csv"
    return clean if clean.lower().endswith(".csv") else f"{clean}.csv"


def _stored_csv(db: Session, user: User, campaign_id: int) -> CampaignUpload:
    c = _owned(db, user, campaign_id)
    upload = db.query(CampaignUpload).filter(CampaignUpload.campaign_id == c.id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="No CSV stored for this campaign")
    return upload


@router.get("/{campaign_id}/csv", response_model=CampaignCsvOut)
def get_campaign_csv(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Preview of the uploaded CSV: headers + the first rows, parsed here so
    quoted commas/newlines render correctly. Download for the full file."""
    upload = _stored_csv(db, user, campaign_id)
    headers: list[str] = []
    rows: list[list[str]] = []
    try:
        reader = csv.reader(io.StringIO(upload.content))
        headers = [h.strip()[:CSV_PREVIEW_CELL] for h in next(reader, [])]
        for row in reader:
            if not any(cell.strip() for cell in row):
                continue
            rows.append([cell[:CSV_PREVIEW_CELL] for cell in row])
            if len(rows) >= CSV_PREVIEW_ROWS:
                break
    except csv.Error:
        pass  # malformed tail: show what parsed; the download still has it all
    return CampaignCsvOut(
        filename=upload.filename,
        uploaded_at=upload.uploaded_at,
        size_bytes=upload.size_bytes,
        total_rows=upload.row_count,
        headers=headers,
        rows=rows,
    )


@router.get("/{campaign_id}/csv/download")
def download_campaign_csv(
    campaign_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    upload = _stored_csv(db, user, campaign_id)
    return Response(
        content=upload.content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{upload.filename}"'},
    )


def _run_pipeline_task(campaign_id: int, owner_id: int) -> None:
    db = SessionLocal()
    try:
        campaign = db.get(Campaign, campaign_id)
        if campaign:
            run_campaign_pipeline(db, campaign, owner_id)
    finally:
        db.close()


@router.post("/{campaign_id}/run")
def run_campaign(
    campaign_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _owned(db, user, campaign_id)
    # Cap full-pipeline launches per user: each run opens several DB sessions and
    # spends search/AI/verification credits, so unbounded triggering could exhaust
    # the connection pool or drain paid quotas.
    enforce(
        f"pipeline-run:{user.id}", 12, 3600,
        "You're starting pipeline runs too quickly. Please wait a few minutes.",
    )
    count = db.query(Company).filter(Company.campaign_id == c.id).count()
    if count == 0:
        raise HTTPException(status_code=400, detail="Upload companies before running")
    add_log(db, user.id, "Campaign", f"Pipeline started for '{c.name}' ({count} companies).")
    background.add_task(_run_pipeline_task, c.id, user.id)
    return {"detail": "Pipeline started", "companies": count}


# --------------------------------------------------------------- pipeline view
@router.get("/{campaign_id}/pipeline", response_model=list[PipelineAgentOut])
def get_pipeline(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-agent status + progress for THIS campaign. Status/last_run come from
    the per-user AgentConfig; totals/completed are derived from campaign data."""
    c = _owned(db, user, campaign_id)
    companies = db.query(Company).filter(Company.campaign_id == c.id).all()
    qualified = [co for co in companies if co.status in ("Qualified", "Contacted")]
    contacts = [ct for co in qualified for ct in co.contacts]
    contact_ids = [ct.id for ct in contacts]

    drafts = (
        db.query(EmailDraft).filter(EmailDraft.contact_id.in_(contact_ids)).all()
        if contact_ids else []
    )
    threads = db.query(Thread).filter(Thread.campaign_id == c.id).all()
    meetings = db.query(Meeting).filter(Meeting.campaign_id == c.id).count()

    configs = {
        a.key: a
        for a in db.query(AgentConfig).filter(AgentConfig.owner_id == user.id)
    }

    def stats(key: str) -> tuple[int, int]:
        if key == "enrichment":
            return len(companies), sum(1 for co in companies if (co.research_summary or "").strip())
        if key == "scoring":
            return len(companies), sum(1 for co in companies if (co.rank or 0) > 0)
        if key == "employee_finder":
            return len(qualified), sum(1 for co in qualified if co.contacts)
        if key == "email_guess_verification":
            return len(contacts), sum(1 for ct in contacts if (ct.email or "").strip())
        if key == "outreach":
            return len(contacts), len(drafts)
        if key == "tracking":
            contacted = [t for t in threads if t.stage in ("Contacted", "Replied", "Negotiating", "Meeting", "Closed")]
            replied = [t for t in threads if t.stage in ("Replied", "Negotiating", "Meeting", "Closed")]
            return len(contacted), len(replied)
        if key == "meeting":
            return len(threads), meetings
        return 0, 0

    out: list[PipelineAgentOut] = []
    for order, (key, name, desc) in enumerate(AGENT_REGISTRY, start=1):
        cfg = configs.get(key)
        total, completed = stats(key)
        out.append(
            PipelineAgentOut(
                key=key,
                name=name,
                description=desc,
                order=cfg.order if cfg else order,
                status=cfg.status if cfg else "Idle",
                enabled=cfg.enabled if cfg else True,
                last_run=cfg.last_run if cfg else None,
                total=total,
                completed=completed,
                runnable=key in RUNNABLE_KEYS,
            )
        )
    out.sort(key=lambda a: a.order)
    return out


@router.get("/{campaign_id}/snapshot", response_model=SnapshotStatusOut)
def get_snapshot_status(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Undo availability for this campaign (drives a future Undo button)."""
    c = _owned(db, user, campaign_id)
    return snapshots.availability(db, c)


@router.post("/{campaign_id}/restore", response_model=CampaignOut)
def restore_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Undo the last destructive run: roll the campaign's pipeline output back to
    the snapshot and consume it. 409 if the campaign has a live conversation."""
    c = _owned(db, user, campaign_id)
    try:
        ok = snapshots.restore(db, c)
    except ConversationActive:
        raise HTTPException(
            status_code=409,
            detail="Undo unavailable: this campaign has active conversations.",
        )
    if not ok:
        raise HTTPException(status_code=404, detail="Nothing to undo.")
    add_log(db, user.id, "Campaign", f"Undid the last run for '{c.name}'.")
    add_notification(
        db, user.id, "campaign", "Run undone",
        f"'{c.name}' was rolled back to its previous state.",
    )
    return campaign_rollups(db, c)


class RunAgentIn(BaseModel):
    key: str
    # force=True clears the agent's prior output before re-running. Useful for
    # re-runs from the per-campaign agent timeline so users don't get the same
    # stale contacts / drafts they already rejected. Defaults False so the
    # bulk "run all" path stays incremental and fast.
    force: bool = False


def _run_agent_task(campaign_id: int, owner_id: int, key: str, force: bool) -> None:
    db = SessionLocal()
    try:
        campaign = db.get(Campaign, campaign_id)
        if campaign:
            run_agent_for_campaign(db, campaign, owner_id, key, force=force)
    finally:
        db.close()


@router.post("/{campaign_id}/run-agent")
def run_agent(
    campaign_id: int,
    payload: RunAgentIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _owned(db, user, campaign_id)
    if payload.key not in RUNNABLE_KEYS:
        raise HTTPException(status_code=400, detail=f"Agent '{payload.key}' cannot be run on demand")
    # Gated agents (outreach/tracking/…) need access; the free agents run capped.
    if payload.key in GATED_AGENT_KEYS and not user.has_access:
        raise HTTPException(
            status_code=403,
            detail="This agent needs access approval. Request it in Settings.",
        )
    suffix = " (force)" if payload.force else ""
    add_log(db, user.id, "Campaign", f"Triggered '{payload.key}' agent for '{c.name}'{suffix}.")
    background.add_task(_run_agent_task, c.id, user.id, payload.key, payload.force)
    return {"detail": f"Agent '{payload.key}' started"}
