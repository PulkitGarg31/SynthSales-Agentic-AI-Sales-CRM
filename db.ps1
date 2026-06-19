# db.ps1 — read-only browser for the Agentic CRM Postgres DB.
#
# Examples:
#   .\db.ps1                          # list available views
#   .\db.ps1 campaigns                # all campaigns (compact)
#   .\db.ps1 campaign 1               # one campaign, fully expanded
#   .\db.ps1 companies                # all companies
#   .\db.ps1 companies 1              # companies in campaign id=1
#   .\db.ps1 company 5                # one company, fully expanded
#   .\db.ps1 contacts                 # all contacts
#   .\db.ps1 contacts 1               # contacts in campaign id=1
#   .\db.ps1 emails                   # outreach emails queue
#   .\db.ps1 health                   # row counts across every table
#   .\db.ps1 sql "<sql>"              # run an arbitrary SELECT
#
# Uses `\x auto` so wide rows automatically flip to vertical (record) layout.

param(
    [Parameter(Position = 0)] [string] $cmd = "",
    [Parameter(Position = 1)] [string] $arg1 = "",
    [Parameter(Position = 2)] [string] $arg2 = ""
)

$Container = "synthsales_postgres"
$DbUser    = "synthsales"
$DbName    = "synthsales"

function Invoke-Sql([string] $sql, [switch] $Expanded) {
    $flags = @("-U", $DbUser, "-d", $DbName)
    if ($Expanded) { $flags += @("-c", "\x on") } else { $flags += @("-c", "\x auto") }
    $flags += @("-c", $sql)
    docker exec -i $Container psql @flags
}

function Show-Menu {
    @"

Agentic CRM — DB browser

  Per-user "folder" view  (think: open one user's workspace)
  .\db.ps1 users                   List users with their campaign/company counts
  .\db.ps1 user <id|email>         Tree view: that user -> campaigns -> companies -> contacts

  Flat (whole-DB) views
  .\db.ps1 campaigns               List all campaigns (compact view)
  .\db.ps1 campaign <id>           One campaign, fully expanded
  .\db.ps1 companies [campaign_id] List companies (optionally filtered)
  .\db.ps1 company <id>            One company, fully expanded
  .\db.ps1 contacts [campaign_id]  List contacts (optionally filtered)
  .\db.ps1 emails [campaign_id]    Outreach emails queue
  .\db.ps1 meetings                Scheduled meetings
  .\db.ps1 logs                    Recent activity logs (last 30)
  .\db.ps1 health                  Row counts for every table
  .\db.ps1 sql "<sql>"             Run arbitrary SELECT

"@ | Write-Host
}

switch ($cmd) {

    "" { Show-Menu; break }

    "campaigns" {
        Invoke-Sql @"
SELECT id, name, status, top_n,
       LEFT(product, 30) AS product,
       LEFT(industry_pref, 40) AS industries,
       created_at::date AS created
FROM campaigns
ORDER BY id;
"@
        break
    }

    "campaign" {
        if (-not $arg1) { Write-Host "Usage: .\db.ps1 campaign <id>"; break }
        Invoke-Sql "SELECT * FROM campaigns WHERE id = $arg1;" -Expanded
        break
    }

    "companies" {
        $where = if ($arg1) { "WHERE campaign_id = $arg1" } else { "" }
        Invoke-Sql @"
SELECT id, campaign_id, rank, ai_score AS score,
       match_level AS match, enrichment_confidence AS conf,
       jsonb_array_length(research_points) AS pts,
       domain_status AS site, status,
       LEFT(name, 30) AS name,
       LEFT(domain, 30) AS domain,
       LEFT(industry, 20) AS industry
FROM companies
$where
ORDER BY campaign_id, rank, id;
"@
        break
    }

    "company" {
        if (-not $arg1) { Write-Host "Usage: .\db.ps1 company <id>"; break }
        Invoke-Sql "SELECT * FROM companies WHERE id = $arg1;" -Expanded
        Invoke-Sql "SELECT id, name, role, email, verification, approved FROM contacts WHERE company_id = $arg1 ORDER BY id;"
        break
    }

    "contacts" {
        if ($arg1) {
            $sql = @"
SELECT ct.id, ct.company_id, co.name AS company,
       ct.name, LEFT(ct.role, 35) AS role,
       ct.email, ct.verification AS verify, ct.approved
FROM contacts ct
JOIN companies co ON co.id = ct.company_id
WHERE co.campaign_id = $arg1
ORDER BY ct.company_id, ct.id;
"@
        } else {
            $sql = @"
SELECT ct.id, ct.company_id, co.name AS company,
       ct.name, LEFT(ct.role, 35) AS role,
       ct.email, ct.verification AS verify, ct.approved
FROM contacts ct
JOIN companies co ON co.id = ct.company_id
ORDER BY ct.company_id, ct.id;
"@
        }
        Invoke-Sql $sql
        break
    }

    "emails" {
        # email_drafts is per-contact; reach campaigns by walking
        # contact -> company -> campaign.
        $where = if ($arg1) { "WHERE co.campaign_id = $arg1" } else { "" }
        Invoke-Sql @"
SELECT e.id, co.campaign_id AS camp, e.contact_id, e.state,
       LEFT(e.subject, 60) AS subject,
       e.created_at::timestamp(0) AS created
FROM email_drafts e
JOIN contacts ct ON ct.id = e.contact_id
JOIN companies co ON co.id = ct.company_id
$where
ORDER BY e.id DESC
LIMIT 50;
"@
        break
    }

    "meetings" {
        Invoke-Sql @"
SELECT id, campaign_id, status,
       LEFT(company, 30) AS company, LEFT(contact, 30) AS contact,
       scheduled_at::timestamp(0) AS scheduled_at
FROM meetings
ORDER BY scheduled_at DESC
LIMIT 30;
"@
        break
    }

    "logs" {
        Invoke-Sql @"
SELECT id, owner_id, category, level,
       LEFT(message, 80) AS message,
       created_at::timestamp(0) AS created
FROM logs
ORDER BY id DESC
LIMIT 30;
"@
        break
    }

    "users" {
        Invoke-Sql @"
SELECT u.id, u.name, u.email,
       u.is_verified  AS verified,
       u.outbound_enabled AS outbound,
       COUNT(DISTINCT ca.id) AS campaigns,
       COUNT(DISTINCT co.id) AS companies,
       COUNT(DISTINCT ct.id) AS contacts
FROM users u
LEFT JOIN campaigns ca ON ca.owner_id = u.id
LEFT JOIN companies co ON co.campaign_id = ca.id
LEFT JOIN contacts  ct ON ct.company_id = co.id
GROUP BY u.id
ORDER BY u.id;
"@
        break
    }

    "user" {
        if (-not $arg1) { Write-Host "Usage: .\db.ps1 user <id|email>"; break }
        # Accept either numeric id or email.
        $idClause = if ($arg1 -match '^\d+$') {
            "u.id = $arg1"
        } else {
            "u.email = '" + ($arg1 -replace "'", "''") + "'"
        }

        # 1) The user row itself.
        Invoke-Sql "SELECT id, name, email, is_verified, outbound_enabled FROM users u WHERE $idClause;"

        # 2) Their campaigns + per-campaign rollup.
        Write-Host "`n  Campaigns:" -ForegroundColor Cyan
        Invoke-Sql @"
SELECT ca.id, ca.name, ca.status, ca.top_n,
       COUNT(DISTINCT co.id) AS companies,
       COUNT(DISTINCT ct.id) AS contacts,
       COUNT(DISTINCT e.id)  AS drafts
FROM campaigns ca
JOIN users u ON u.id = ca.owner_id
LEFT JOIN companies co ON co.campaign_id = ca.id
LEFT JOIN contacts  ct ON ct.company_id = co.id
LEFT JOIN email_drafts e ON e.contact_id = ct.id
WHERE $idClause
GROUP BY ca.id
ORDER BY ca.id;
"@

        # 3) Their companies (across all their campaigns).
        Write-Host "`n  Companies (top 30 by rank):" -ForegroundColor Cyan
        Invoke-Sql @"
SELECT co.id, ca.id AS camp, LEFT(ca.name, 22) AS campaign,
       co.rank, co.ai_score AS score, co.status,
       co.domain_status AS site,
       LEFT(co.name, 30) AS company,
       LEFT(co.domain, 25) AS domain
FROM companies co
JOIN campaigns ca ON ca.id = co.campaign_id
JOIN users u ON u.id = ca.owner_id
WHERE $idClause
ORDER BY ca.id, co.rank
LIMIT 30;
"@

        # 4) Their contacts.
        Write-Host "`n  Contacts (top 30):" -ForegroundColor Cyan
        Invoke-Sql @"
SELECT ct.id, co.id AS co, LEFT(co.name, 22) AS company,
       LEFT(ct.name, 22) AS name,
       LEFT(ct.role, 30) AS role,
       ct.verification AS verify, ct.approved
FROM contacts ct
JOIN companies co ON co.id = ct.company_id
JOIN campaigns ca ON ca.id = co.campaign_id
JOIN users u ON u.id = ca.owner_id
WHERE $idClause
ORDER BY co.id, ct.id
LIMIT 30;
"@
        break
    }

    "health" {
        Invoke-Sql @"
SELECT 'users'        AS table_name, COUNT(*) FROM users        UNION ALL
SELECT 'campaigns',     COUNT(*) FROM campaigns                  UNION ALL
SELECT 'companies',     COUNT(*) FROM companies                  UNION ALL
SELECT 'contacts',      COUNT(*) FROM contacts                   UNION ALL
SELECT 'email_drafts',  COUNT(*) FROM email_drafts                     UNION ALL
SELECT 'threads',       COUNT(*) FROM threads                    UNION ALL
SELECT 'messages',      COUNT(*) FROM messages                   UNION ALL
SELECT 'meetings',      COUNT(*) FROM meetings                   UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications              UNION ALL
SELECT 'logs',          COUNT(*) FROM logs                       UNION ALL
SELECT 'agent_configs', COUNT(*) FROM agent_configs;
"@
        break
    }

    "sql" {
        if (-not $arg1) { Write-Host "Usage: .\db.ps1 sql ""SELECT ..."""; break }
        Invoke-Sql $arg1
        break
    }

    default {
        Write-Host "Unknown command: $cmd"
        Show-Menu
    }
}
