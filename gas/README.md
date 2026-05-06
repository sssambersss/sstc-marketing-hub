# SST&C Marketing Hub GAS Proxy

This Google Apps Script web app keeps the OpenAI API key out of the GitHub Pages frontend.

## Setup

1. Create a new Google Apps Script project.
2. Paste `openai-proxy.gs` into `Code.gs`.
3. Open **Project Settings**.
4. Add script property:
   - `OPENAI_API_KEY`: your OpenAI API key
   - Optional `OPENAI_MODEL`: `gpt-5.2`
5. Deploy as a **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web app URL and paste it into Ad Studio's AI endpoint setting.

