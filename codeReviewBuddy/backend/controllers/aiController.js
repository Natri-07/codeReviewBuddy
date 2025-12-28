
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const USE_MOCK_AI = !process.env.GROQ_API_KEY || process.env.USE_MOCK_AI === 'true';

const callGroq = async (messages, maxTokens = 1000) => {
  try {
    console.log('Making Groq API call...');
    const response = await axios.post(GROQ_API_URL, {
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('Groq API response received');
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Groq API Error:', error.response?.status, error.response?.data);
    throw error;
  }
};

export const reviewCode = async (req, res) => {
  try {
    console.log('Review request received:', req.body);
    
    const { code, language, fileName } = req.body;
    
    // Use mock AI if DeepSeek is not available or configured
    if (USE_MOCK_AI) {
      console.log('Using mock AI for code review');
      const mockReview = `**Code Review for ${fileName}**

**Code Quality Assessment:**
The code structure is readable but could benefit from some improvements.

**Potential Issues:**
• Missing input validation
• No error handling for edge cases
• Variable names could be more descriptive

**Suggestions for Improvement:**
• Consider adding type hints for better code documentation
• Add error handling with try-catch blocks
• Use more descriptive variable names

**Security Notes:**
• Validate all user inputs
• Implement proper authentication and authorization

*Note: This is a mock review. For detailed AI analysis, configure DeepSeek API.*`;
      
      return res.json({
        review: mockReview,
        timestamp: new Date().toISOString()
      });
    }
    
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }
    
    const prompt = `Review this ${language} code from file "${fileName}":

\`\`\`${language}
${code}
\`\`\`

Provide:
1. Code quality assessment
2. Potential bugs or issues
3. Performance improvements
4. Best practices suggestions
5. Security concerns (if any)

Keep the response concise and actionable.`;

    console.log('Calling Groq API...');
    
    const review = await callGroq([{ role: "user", content: prompt }], 1000);

    console.log('Groq response received');
    
    res.json({ 
      review,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Review Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data || 'Unknown error'
    });
  }
};

export const chatWithAI = async (req, res) => {
  try {
    console.log('Chat request received:', req.body);

    // 1. EXTRACT DATA FIRST (Fixes the 500 Error)
    const { message, codeContext } = req.body;

    // 2. Validate input immediately
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 3. Handle Mock AI Logic
    if (USE_MOCK_AI) {
      console.log('Using mock AI for chat');
      let mockResponse = "";
      const lowerMsg = message.toLowerCase(); // Now 'message' is safe to use

      if (lowerMsg.includes('error') || lowerMsg.includes('bug')) {
        mockResponse = "I can help you debug! Common issues include syntax errors or variable scope problems.";
      } else if (lowerMsg.includes('optimize') || lowerMsg.includes('performance')) {
        mockResponse = "For performance optimization, consider efficient data structures and minimizing loops.";
      } else {
        mockResponse = "I'm here to help with your code! I can assist with reviews, debugging, and best practices. *Note: Mock AI active.*";
      }

      return res.json({
        response: mockResponse,
        timestamp: new Date().toISOString()
      });
    }

    // 4. Handle Real Groq AI Logic
    let prompt = message;
    if (codeContext && codeContext.code) {
      prompt = `Context - Current code:
\`\`\`${codeContext.language}
${codeContext.code}
\`\`\`

User question: ${message}`;
    }

    const response = await callGroq([{ role: "user", content: prompt }], 800);

    res.json({
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || 'Unknown error'
    });
  }
};
export const suggestFix = async (req, res) => {
  try {
    if (USE_MOCK_AI) {
      return res.json({
        suggestion: "Mock fix suggestion: Check for common issues like syntax errors, variable scope, and data validation.",
        timestamp: new Date().toISOString()
      });
    }

    const { code, language, issue } = req.body;
    
    const prompt = `Fix this issue in the ${language} code:

Issue: ${issue}

Current code:
\`\`\`${language}
${code}
\`\`\`

Provide the corrected code with explanation of changes.`;

    const suggestion = await callGroq([{ role: "user", content: prompt }], 1000);

    res.json({ 
      suggestion,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};