export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { base64, mediaType } = req.body

  if (!base64 || !mediaType) {
    return res.status(400).json({ error: 'Missing base64 or mediaType' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' })
  }

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `You are analyzing an IPL cricket scorecard image. Extract ALL player performances from this scorecard.

For EVERY batsman shown, extract:
- name (exact as shown)
- runs scored
- balls faced
- fours hit
- sixes hit
- how they got out (bowled/lbw/caught/run out/stumped/not out)

For EVERY bowler shown, extract:
- name (exact as shown)
- overs bowled
- maidens
- runs conceded
- wickets taken

For fielding, if visible extract catches/stumpings/run outs.

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "batting": [
    {
      "name": "Virat Kohli",
      "runs": 72,
      "balls": 43,
      "fours": 8,
      "sixes": 2,
      "dismissal": "not out"
    }
  ],
  "bowling": [
    {
      "name": "Jasprit Bumrah",
      "overs": 4.0,
      "maidens": 1,
      "runsConceded": 22,
      "wickets": 3
    }
  ],
  "fielding": [
    {
      "name": "MS Dhoni",
      "catches": 2,
      "stumpings": 1,
      "runOuts": 0
    }
  ]
}`
            }
          ]
        }]
      })
    })
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API' })
  }

  const data = await response.json()

  if (!response.ok) {
    return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' })
  }

  return res.status(200).json(data)
}
