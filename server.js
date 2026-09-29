import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Environment variables
// --------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY environment variable");
}

if (!GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

// --------------------------------------------------
// Clients
// --------------------------------------------------

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json({ limit: "1mb" }));

app.use(
  express.static(path.join(__dirname, "public"))
);

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "personal-ai-assistant"
  });
});

// --------------------------------------------------
// Root route
// --------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// --------------------------------------------------
// Chat API
// --------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const { prompt, userId } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    // ----------------------------------------------
    // Ask Gemini
    // ----------------------------------------------

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt
    });

    const answer =
      response.text || "No response generated.";

    // ----------------------------------------------
    // Save conversation if userId is supplied
    // ----------------------------------------------

    if (userId) {
      const { data: conversation, error: conversationError } =
        await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            title: prompt.substring(0, 80)
          })
          .select()
          .single();

      if (conversationError) {
        console.error(
          "Conversation save error:",
          conversationError
        );
      } else if (conversation) {
        const { error: messageError } =
          await supabase
            .from("messages")
            .insert([
              {
                conversation_id: conversation.id,
                role: "user",
                content: prompt
              },
              {
                conversation_id: conversation.id,
                role: "assistant",
                content: answer
              }
            ]);

        if (messageError) {
          console.error(
            "Message save error:",
            messageError
          );
        }
      }
    }

    return res.json({
      success: true,
      response: answer
    });

  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      success: false,
      error: "AI request failed",
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message
    });
  }
});

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Personal AI Assistant running on port ${PORT}`
  );
});

