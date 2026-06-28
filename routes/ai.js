/**
 * routes/ai.js — AI-powered features (objet social generation)
 * Fixes: #1 (API key in URL → header), #2 (prompt injection)
 */

const https = require("https");
const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { sanitizePrompt } = require("../lib/sanitize");
const { stmts } = require("../db");

module.exports = function aiRoutes(pathname, req, res, url) {

  if (pathname === "/api/generate-objet" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        // Fix #2: sanitize and limit description to prevent prompt injection
        const description = sanitizePrompt(body.description || "", 500);
        if (!description) return errorResponse(res, 400, "description requise");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return errorResponse(res, 500, "Clé API IA non configurée");

        const prompt = `Tu es un expert en droit des sociétés français. Rédige un objet social complet et juridiquement correct pour une société dont l'activité est : "${description}".

Règles :
- Rédige uniquement l'objet social, sans introduction ni commentaire
- Utilise un style juridique professionnel
- Couvre l'activité principale et les activités connexes habituelles
- Inclus une clause générale finale du type "et plus généralement, toutes opérations..."
- Sépare chaque activité par un retour à la ligne (une activité par ligne)
- Maximum 6 lignes
- Pas de numérotation ni de tirets`;

        const payload = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        });

        const result = await new Promise((resolve, reject) => {
          const apiReq = https.request({
            hostname: "generativelanguage.googleapis.com",
            // Fix #1: API key passed via header instead of URL query param
            path: "/v1beta/models/gemini-2.5-flash:generateContent",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            }
          }, (apiRes) => {
            let data = "";
            apiRes.on("data", chunk => data += chunk);
            apiRes.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.error) return reject(new Error(parsed.error.message));
                const text = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts && parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
                if (!text) return reject(new Error("Réponse IA vide"));
                const usage = parsed.usageMetadata || {};
                resolve({ text, promptTokens: usage.promptTokenCount || 0, completionTokens: usage.candidatesTokenCount || 0, totalTokens: usage.totalTokenCount || 0 });
              } catch (e) { reject(e); }
            });
          });
          apiReq.on("error", reject);
          apiReq.write(payload);
          apiReq.end();
        });

        stmts.logApiUsage.run(user.id, "gemini-2.5-flash", result.promptTokens, result.completionTokens, result.totalTokens);
        return jsonResponse(res, 200, { ok: true, objet: result.text });
      } catch (e) {
        // Fix #11: generic error in production, no sensitive data leak
        return errorResponse(res, 500, "Erreur lors de la génération");
      }
    })();
  }

  return false;
};
