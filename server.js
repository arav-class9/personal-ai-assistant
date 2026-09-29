const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'Personal AI Assistant Backend' });
});

// Chat Endpoint: Stores prompt, queries Gemini, stores response
app.post('/api/chat', async (req, res) => {
  try {
    const { userId, conversationId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required.' });
    }

    let activeConversationId = conversationId;

    // 1. Create a conversation if one wasn't provided
    if (!activeConversationId) {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .insert([{ user_id: userId, title: message.substring(0, 30) }])
        .select()
        .single();

      if (convError) throw convError;
      activeConversationId = convData.id;
    }

    // 2. Insert User Message into messages table
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: activeConversationId,
        user_id: userId,
        role: 'user',
        content: message
      }]);

    if (userMsgError) throw userMsgError;

    // 3. Query Gemini AI server-side (Keys stay protected)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
    });

    const assistantReply = response.text;

    // 4. Insert Assistant Reply into messages table
    const { error: assistantMsgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: activeConversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantReply
      }]);

    if (assistantMsgError) throw assistantMsgError;

    // 5. Return clean response to caller
    return res.json({
      conversationId: activeConversationId,
      reply: assistantReply
    });

  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
