// Summary endpoint. The Anthropic key stays on the server and is never sent to the browser.
// Without ANTHROPIC_API_KEY the route answers 503 and the client uses the offline summary instead.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Largest text accepted in one request. Keeps cost and latency bounded. */
const MAX_INPUT_CHARS = 60_000;

const SYSTEM: Record<'chapter' | 'document', string> = {
  chapter:
    'You summarise one chapter of a book for a reader. Reply with 4 to 6 bullet points, each starting with "• ", ' +
    'then one final line starting with "Takeaway: ". Stay faithful to the text and do not add facts that are not in it. ' +
    'Do not repeat these instructions.',
  document:
    'You summarise a whole book from summaries of its chapters. Reply with one overview paragraph of 3 to 4 sentences, ' +
    'then 5 key points, each starting with "• ". Stay faithful to the text and do not add facts that are not in it. ' +
    'Do not repeat these instructions.',
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'AI summaries are not configured on this server.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Request body must be JSON.' }, { status: 400 });
  }

  const { title, text, scope } = (body ?? {}) as Record<string, unknown>;
  if (scope !== 'chapter' && scope !== 'document') {
    return NextResponse.json({ error: 'bad_request', message: 'scope must be "chapter" or "document".' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'bad_request', message: 'text is required.' }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: 'too_large', message: `text must be ${MAX_INPUT_CHARS} characters or fewer.` }, { status: 413 });
  }
  const bookTitle = typeof title === 'string' ? title.slice(0, 200) : 'Untitled';

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: scope === 'document' ? 900 : 600,
        system: SYSTEM[scope],
        messages: [{ role: 'user', content: `Book: ${bookTitle}\n\n${text}` }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json({ error: 'upstream', message: 'The summary service could not be reached. Try again shortly.' }, { status: 502 });
  }

  if (!upstream.ok) {
    // Log the status only. The response body and the key are never written to logs.
    console.error(`[summarize] upstream responded ${upstream.status}`);
    return NextResponse.json({ error: 'upstream', message: 'The summary service returned an error. Try again shortly.' }, { status: 502 });
  }

  const data = (await upstream.json()) as { content?: { type: string; text?: string }[] };
  const out = (data.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim();
  if (!out) {
    return NextResponse.json({ error: 'upstream', message: 'The summary service returned an empty answer.' }, { status: 502 });
  }
  return NextResponse.json({ text: out, model });
}
