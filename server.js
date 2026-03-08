import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(__dirname));

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. Live API mode will fail until you add it to .env.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractText(response) {
  if (response.output_text) return response.output_text;
  if (Array.isArray(response.output)) {
    return response.output
      .flatMap((item) => item.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("");
  }
  return JSON.stringify(response);
}

function buildPrompt(task, payload) {
  const system = [
    "당신은 AI 기반 SNS 마케팅 교육 전문가입니다.",
    "항상 한국어로 답하세요.",
    "학생이 쉽게 이해할 수 있도록 친절하고 구조적으로 답하세요.",
    "가능하면 실전형 제안을 하세요.",
  ].join(" ");

  const taskPrompts = {
    healthcheck: `JSON으로만 답하세요. {"ok": true, "reply": "연결 성공"}`,
    blog_planning: `다음 자료를 바탕으로 블로그 기획 초안을 만드세요.
반드시 JSON으로만 답하고, 형식은 {"analysis":"...","reco":{"targetPersona":"...","coreTopic":"...","titleCandidates":["..."],"categories":["..."],"keywords":["..."],"tone":"...","lengthGuide":"...","firstMonthStrategy":"..."},"planText":"..."} 입니다.
자료: ${JSON.stringify(payload)}`,
    coaching_feedback: `학생이 쓴 계획과 AI 기획을 비교해서 짧고 친절한 피드백을 주세요.
반드시 JSON으로만 답하고 형식은 {"feedback":"..."} 입니다.
자료: ${JSON.stringify(payload)}`,
    calendar_generation: `최종 기획안을 바탕으로 4주 콘텐츠 캘린더를 만드세요.
반드시 JSON으로만 답하고 형식은 {"items":[{"week":"...","topic":"...","format":"...","goal":"...","category":"...","keyword":"..."}]} 입니다.
자료: ${JSON.stringify(payload)}`,
    blog_draft: `네이버 블로그 글 초안을 작성하세요.
반드시 JSON으로만 답하고 형식은 {"draft":"..."} 입니다.
주어진 설정의 타겟, 문체, 길이, CTA를 반영하세요.
자료: ${JSON.stringify(payload)}`,
    image_prompts: `블로그 글에 어울리는 이미지 생성 프롬프트 4개를 만드세요.
반드시 JSON으로만 답하고 형식은 {"prompts":["...","...","...","..."]} 입니다.
자료: ${JSON.stringify(payload)}`,
  };

  return {
    system,
    user: taskPrompts[task] || `JSON으로 답하세요. 자료: ${JSON.stringify(payload)}`,
  };
}

app.post("/api/openai", async (req, res) => {
  try {
    const { model = "gpt-5.4", task = "healthcheck", payload = {} } = req.body || {};
    const { system, user } = buildPrompt(task, payload);

    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
    });

    res.json({ output_text: extractText(response), raw: response });
  } catch (error) {
    res.status(500).send(error?.message || String(error));
  }
});

app.post("/api/openai-image", async (req, res) => {
  try {
    const { prompts = [], size = "1024x1024" } = req.body || {};
    const images = [];

    for (const prompt of prompts.slice(0, 3)) {
      const result = await client.images.generate({
        model: "gpt-image-1",
        prompt,
        size,
      });
      const first = result?.data?.[0];
      if (first?.b64_json) {
        images.push(`data:image/png;base64,${first.b64_json}`);
      }
    }

    res.json({ images });
  } catch (error) {
    res.status(500).send(error?.message || String(error));
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
