/**
 * SSE Streaming client for Contract Query & Citation Synthesis.
 * Consumes POST /api/query/stream/ with HttpOnly credentials over Server-Sent Events.
 * Supports multi-target parallel document dispatch and legacy single-document streams.
 */
export async function streamContractQuery({
  query,
  documentId = null,
  documentIds = null,
  topK = 5,
  onMetadata,
  onDelta,
  onVerification,
  onRoute,
  onWorkerStatus,
  onCitation,
  onToken,
  onTelemetry,
  onError,
  onDone,
  signal,
}) {
  try {
    const payload = {
      query: query.trim(),
      top_k: topK,
    };
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      payload.document_ids = documentIds;
    } else if (documentId) {
      payload.document_id = documentId;
    }

    const response = await fetch('/api/query/stream/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const message =
        errJson.detail ||
        errJson.query?.[0] ||
        `Query stream failed with status ${response.status}`;
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let streamDone = false;

    while (!streamDone) {
      const { value, done } = await reader.read();
      if (done) {
        streamDone = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      // Keep trailing incomplete chunk in buffer
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        const lines = eventBlock.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.replace('event: ', '').trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.replace('data: ', '').trim();
          }
        }

        if (!dataStr) continue;

        try {
          if (eventType === 'route') {
            const parsed = JSON.parse(dataStr);
            if (onRoute) onRoute(parsed);
          } else if (eventType === 'worker_status') {
            const parsed = JSON.parse(dataStr);
            if (onWorkerStatus) onWorkerStatus(parsed);
          } else if (eventType === 'citation') {
            const parsed = JSON.parse(dataStr);
            if (onCitation) onCitation(parsed);
          } else if (eventType === 'token') {
            const parsed = JSON.parse(dataStr);
            const content = parsed.content || '';
            if (onToken) onToken(content);
            if (onDelta) onDelta(content);
          } else if (eventType === 'metadata') {
            const parsed = JSON.parse(dataStr);
            if (onMetadata) onMetadata(parsed);
          } else if (eventType === 'delta') {
            const parsed = JSON.parse(dataStr);
            const content = parsed.content || '';
            if (onDelta) onDelta(content);
            if (onToken) onToken(content);
          } else if (eventType === 'verification') {
            const parsed = JSON.parse(dataStr);
            if (onVerification) onVerification(parsed);
          } else if (eventType === 'telemetry') {
            const parsed = JSON.parse(dataStr);
            if (onTelemetry) onTelemetry(parsed);
          } else if (eventType === 'done' || dataStr === '[DONE]') {
            if (onDone) onDone();
          }
        } catch {
          // If JSON parse fails on an event, continue processing subsequent stream tokens
        }
      }
    }

    if (onDone) onDone();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (onDone) onDone();
      return;
    }
    if (onError) onError(err);
  }
}

export const streamQuery = streamContractQuery;
