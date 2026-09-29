/**
 * SSE Streaming client for Contract Query & Citation Synthesis.
 * Consumes POST /api/query/stream/ with HttpOnly credentials over Server-Sent Events.
 */
export async function streamContractQuery({
  query,
  documentId = null,
  topK = 5,
  onMetadata,
  onDelta,
  onVerification,
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
    if (documentId) {
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
          if (eventType === 'metadata') {
            const parsed = JSON.parse(dataStr);
            if (onMetadata) onMetadata(parsed);
          } else if (eventType === 'delta') {
            const parsed = JSON.parse(dataStr);
            if (onDelta) onDelta(parsed.content || '');
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
