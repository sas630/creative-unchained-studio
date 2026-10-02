import { createFileRoute } from "@tanstack/react-router";

const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts"];

function pcmToWav(pcm: Uint8Array, sampleRate = 24000) {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { text?: string; keys?: string } | null;
        const text = body?.text?.slice(0, 4000).trim();
        const keys = (body?.keys ?? "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
        if (!text) return new Response("Texto vazio.", { status: 400 });
        if (keys.length === 0)
          return new Response("Adicione uma chave grátis do Google Gemini em Ajustes para ouvir as respostas.", { status: 400 });
        let lastError = "Não foi possível gerar a voz.";
        for (const model of TTS_MODELS) {
          for (const key of keys) {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: `Leia em português do Brasil, com emoção natural: ${text}` }] }],
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
                  },
                }),
              },
            );
            if (!res.ok) {
              lastError = `${model}: HTTP ${res.status}`;
              if (res.status === 404) break; // modelo indisponível: próximo modelo
              continue;
            }
            const json = (await res.json()) as {
              candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
            };
            const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
            if (!b64) {
              lastError = `${model}: resposta sem áudio`;
              continue;
            }
            const wav = pcmToWav(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
            return new Response(wav, { headers: { "Content-Type": "audio/wav" } });
          }
        }
        return new Response(lastError, { status: 502 });
      },
    },
  },
});
