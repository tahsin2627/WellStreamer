export async function generateAISummary({ title, synopsis, imdbId }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a streaming platform's content curator. Write a punchy 2-sentence hook for this title that makes someone want to watch it immediately. Then give 4 genre/mood tags.

Title: ${title}
Synopsis: ${synopsis || 'Not available'}
IMDB: ${imdbId || 'N/A'}

Reply with ONLY valid JSON, no markdown: {"hook":"...","tags":["...","...","...","..."]}`,
      }]
    })
  })

  if (!res.ok) throw new Error(`AI API ${res.status}`)
  const data = await res.json()
  const raw = data.content?.[0]?.text?.trim() || '{}'
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}
