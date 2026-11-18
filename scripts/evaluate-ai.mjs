import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

function normalizedAnswerKey(key) {
  return key.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
}

const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL;
const jevKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY;
if (!groqKey || !groqModel || !jevKey) {
  console.error('AI eval requires GROQ_API_KEY, GROQ_MODEL, and JEV_API_KEY (or TYPESAFE_API_KEY).');
  process.exitCode = 1;
} else {
  const timeout = AbortSignal.timeout(25_000);

  async function evaluateGroq() {
    const base = (process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      signal: timeout,
      body: JSON.stringify({
        model: groqModel,
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Choose exactly one supplied candidate that best matches the preference. Use only its exact id. Return JSON: {"action":"proposal","activity":{"placeId":"candidate id","durationMinutes":60,"reason":"short reason"},"done":false}. Do not add fields.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              preference: 'I want a quiet nature walk. Do not choose museums or restaurants.',
              candidates: [
                { id: 'riverside-park', name: 'Riverside Park', types: ['park', 'nature'] },
                { id: 'history-museum', name: 'City History Museum', types: ['museum', 'history'] },
                { id: 'food-market', name: 'Central Food Market', types: ['market', 'food'] },
              ],
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq request failed (HTTP ${response.status}).`);
    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content;
    let answer;
    try {
      answer = JSON.parse(raw);
    } catch {
      throw new Error('Groq did not return valid JSON.');
    }
    const activity = answer?.activity;
    const checks = {
      actionIsProposal: answer?.action === 'proposal',
      selectedExpectedCandidate: activity?.placeId === 'riverside-park',
      durationInRange: Number.isInteger(activity?.durationMinutes) && activity.durationMinutes >= 15 && activity.durationMinutes <= 180,
      hasReason: typeof activity?.reason === 'string' && activity.reason.trim().length > 0,
      doesNotFinishBeforePlanning: answer?.done === false,
    };
    return {
      service: 'Groq',
      model: payload.model ?? groqModel,
      passed: Object.values(checks).every(Boolean),
      checks,
      selectedPlaceId: activity?.placeId ?? null,
    };
  }

  async function evaluateJev() {
    const base = (process.env.JEV_BASE_URL?.trim() || 'https://api.typesafe.ai').replace(/\/$/, '');
    const endpoint = base.endsWith('/systemone') ? base : base.endsWith('/v1') ? `${base}/systemone` : `${base}/v1/systemone`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jevKey}`, 'Content-Type': 'application/json' },
      signal: timeout,
      body: JSON.stringify({
        model: process.env.JEV_MODEL ?? 'jev-latest',
        state: {
          userPreference: 'The traveler explicitly wants a quiet nature walk and does not want museums.',
          scope: 'candidate',
          subjects: [
            { id: 'riverside-park', place: { name: 'Riverside Park', types: ['park', 'nature'] } },
            { id: 'history-museum', place: { name: 'City History Museum', types: ['museum', 'history'] } },
          ],
        },
        questions: {
          'riverside-park': {
            type: 'choice',
            instructions: 'Does this candidate fit the traveler’s explicit preference? Judge only the supplied facts.',
            criteria: {
              pass: 'The supplied name and types support a quiet nature walk.',
              flag: 'The supplied facts directly conflict with the preference.',
              unknown: 'The supplied facts are insufficient to decide.',
            },
          },
          'history-museum': {
            type: 'choice',
            instructions: 'Does this candidate fit the traveler’s explicit preference? Judge only the supplied facts. A museum is explicitly excluded, so any museum must be flagged; exclusions take priority over positive thematic similarity.',
            criteria: {
              pass: 'The supplied name and types support a quiet nature walk and do not match any explicit exclusion.',
              flag: 'The candidate is a museum, which the traveler explicitly does not want, even if history is otherwise interesting.',
              unknown: 'The supplied facts are insufficient to decide.',
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Jev request failed (HTTP ${response.status}).`);
    const raw = await response.json();
    if (typeof raw.code === 'number' && raw.code !== 0)
      throw new Error(`Jev returned provider code ${raw.code}.`);
    const payload = raw.data ?? raw;
    const answers = payload.answers ?? {};
    const answerFor = (id) => {
      if (Object.hasOwn(answers, id)) return answers[id];
      const matches = Object.keys(answers).filter(key => normalizedAnswerKey(key) === normalizedAnswerKey(id));
      return matches.length === 1 ? answers[matches[0]] : undefined;
    };
    const park = answerFor('riverside-park');
    const museum = answerFor('history-museum');
    const validChoice = (answer) => ['pass', 'flag', 'unknown'].includes(answer?.choice);
    const validDistribution = (answer) => {
      const values = Object.values(answer?.probabilities ?? {});
      return values.length === 3 && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
        && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 0.05;
    };
    const validConfidence = (answer) => Number.isFinite(answer?.confidence) && answer.confidence >= 0 && answer.confidence <= 1;
    const checks = {
      parkAnswerMatchesExpectedChoice: park?.choice === 'pass',
      museumAnswerMatchesExpectedChoice: museum?.choice === 'flag',
      bothChoicesValid: validChoice(park) && validChoice(museum),
      bothProbabilityDistributionsValid: validDistribution(park) && validDistribution(museum),
      bothConfidencesValid: validConfidence(park) && validConfidence(museum),
      noConfidentlyWrongChoices: (park?.confidence < 0.5 || park?.choice === 'pass')
        && (museum?.confidence < 0.5 || museum?.choice === 'flag'),
    };
    return {
      service: 'Jev',
      model: payload.model ?? process.env.JEV_MODEL ?? 'jev-latest',
      passed: Object.values(checks).every(Boolean),
      checks,
      responseShape: {
        rootKeys: Object.keys(raw ?? {}),
        dataKeys: Object.keys(raw.data ?? {}),
        answerKeys: Object.keys(answers),
        providerCode: typeof raw.code === 'number' ? raw.code : null,
        providerMessage: typeof raw.message === 'string' ? raw.message.slice(0, 120) : null,
      },
      choices: {
        'riverside-park': park ? { choice: park.choice, confidence: park.confidence, applicationDecision: park.confidence >= 0.5 ? park.choice : 'unknown', probabilities: park.probabilities } : null,
        'history-museum': museum ? { choice: museum.choice, confidence: museum.confidence, applicationDecision: museum.confidence >= 0.5 ? museum.choice : 'unknown', probabilities: museum.probabilities } : null,
      },
    };
  }

  const results = await Promise.all([
    evaluateGroq().catch(error => ({ service: 'Groq', passed: false, error: error instanceof Error ? error.message : 'Unknown provider error.' })),
    evaluateJev().catch(error => ({ service: 'Jev', passed: false, error: error instanceof Error ? error.message : 'Unknown provider error.' })),
  ]);
  const report = {
    suite: 'daymark-ai-smoke-evals-v1',
    scenarios: 2,
    passed: results.filter(result => result.passed).length,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!results.every(result => result.passed)) process.exitCode = 1;
}
