import express from "express";
import pkg from 'pg';
const { Pool } = pkg;
import axios from 'axios';
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.URL_DO_BANCO_DE_DADOS,
});

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFICAR_TOKEN) {
    console.log("Webhook verificado!");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  try {
    if (body.object === "whatsapp_business_account") {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message) {
        const from = message.from;
        const msgText = message.text?.body;

        await pool.query(
          'INSERT INTO messages (content, sender, timestamp) VALUES ($1, $2, NOW())',
          [msgText, 'lead']
        );

        const response = await genAI.models.generateContent({
          model: "gemini-2.0-flash",
          contents: `Voce e um assistente de vendas prestativo do CNA. Responda de forma curta e amigavel: "${msgText}"`
        });
        const aiResponse = response.text;

        await axios.post(
          `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          { messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse } },
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
        );

        await pool.query(
          'INSERT INTO messages (content, sender, timestamp) VALUES ($1, $2, NOW())',
          [aiResponse, 'agent']
        );
      }
      return res.sendStatus(200);
    }
  } catch (error) {
    console.error("Erro:", error);
  }
  res.sendStatus(404);
});

const PORT = process.env.PORTA || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
