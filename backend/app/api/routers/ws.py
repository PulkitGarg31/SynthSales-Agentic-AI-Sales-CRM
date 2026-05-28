from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.realtime.ws import manager

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """Realtime channel. Connect with /ws?token=<JWT>.

    Pushes {event, data} frames for `notification` and `log` events.
    """
    subject = decode_access_token(token)
    if subject is None or not subject.isdigit():
        await websocket.close(code=1008)
        return
    user_id = int(subject)
    await manager.connect(user_id, websocket)
    try:
        while True:
            # Keep the socket open; ignore inbound messages (heartbeat/ping).
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception:
        await manager.disconnect(user_id, websocket)
