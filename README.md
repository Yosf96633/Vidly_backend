# Vidspire Backend

Welcome to the **Vidspire Backend** project. This repository contains the server-side logic for the Vidspire application.

## 🚀 Technologies

This application is built using Node.js and TypeScript, leveraging powerful AI integrations:

- **Runtime**: Node.js
- **Language**: TypeScript
- **AI Framework**: [LangChain](https://js.langchain.com/)
- **LLM Providers**:
  - **Google Generative AI**: Integration with Gemini models via `@google/generative-ai`.
  - **Anthropic**: Integration with Claude models via `@langchain/anthropic`.
- **Data & Utilities**:
  - **Protocol Buffers**: `@bufbuild/protobuf` for efficient data serialization.
  - **UUID**: For generating unique identifiers.

## � Project Structure

```
vidspire-backend/
├── src/
│   ├── controllers/      # Request handlers
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic & AI integration
│   ├── utils/            # Utility functions
│   └── server.ts         # Entry point
├── .env                  # Environment variables
├── package.json          # Project dependencies and scripts
└── README.md             # Project documentation
```

## �🛠️ Installation

Ensure you have Node.js (LTS version recommended) installed.

```bash
# Clone the repository
git clone <repository-url>

# Navigate into the directory
cd vidspire-backend

# Install dependencies
npm install
```

## ⚙️ Configuration

Create a `.env` file in the root directory to configure your API keys for the AI services:

```env
GOOGLE_API_KEY=your_google_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## 📜 Usage

_Check `package.json` for specific script names._

- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Start**: `npm start`
