import { DurableObject } from 'cloudflare:workers';

/**
 * One Durable Object per request (依頼) chat. The Worker authorises the
 * participant before forwarding the WebSocket upgrade, and persists messages
 * to D1 before asking this object to broadcast them. Uses the WebSocket
 * Hibernation API so idle rooms cost nothing.
 */
export class ChatRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(payload);
        } catch {
          // socket already closed
        }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients only receive; messages are sent through the authenticated HTTP API.
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, 'closed');
  }
}
