# PDF Translator

A web application that allows users to translate long PDF documents using various LLM (Large Language Model) providers.

## Features

- Upload and process PDF files for translation
- Extract text from PDF documents
- Translate text paragraphs using different LLM providers:
  - OpenAI (GPT)
  - Anthropic (Claude)
  - Google (Gemini)
  - Ollama (Local LLMs)
- Choose target translation language
- View original and translated text side-by-side
- Generate and download translated PDFs
- Modern and responsive user interface
- Built-in retry logic and rate-limiting handling for API stability

## Prerequisites

- Python 3.8 or higher
- [Ollama](https://ollama.ai/) (optional, for using local LLMs)
- API keys for the LLM services you want to use:
  - OpenAI API key
  - Claude API key
  - Gemini API key

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd pdf-translator
   ```

2. Create and activate a virtual environment (recommended):
   ```
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. If you want to use Ollama for local LLM translation:
   - Install Ollama following instructions at [ollama.ai](https://ollama.ai/)
   - Pull the models you want to use:
     ```
     ollama pull llama3.1
     ollama pull gemma-2-9b
     ```

## Usage

1. Start the Flask application:
   ```
   python app.py
   ```

2. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

3. Using the application:
   - Select your preferred LLM provider
   - Enter your API key (not required for Ollama)
   - Choose your target language
   - Upload a PDF file
   - Click "Translate PDF"
   - View the translated content and download the translated PDF

## API Configuration

For each LLM provider, you'll need to obtain an API key:

- **OpenAI API key**: Sign up at [platform.openai.com](https://platform.openai.com/)
- **Claude API key**: Sign up at [console.anthropic.com](https://console.anthropic.com/)
- **Gemini API key**: Sign up at [ai.google.dev](https://ai.google.dev/)

## Performance Considerations

- **Rate Limiting**: The application includes built-in retry logic with exponential backoff for handling API rate limits.
- **Batch Processing**: Long PDFs are processed in small batches to avoid overwhelming the LLM APIs.
- **API Costs**: Be aware that using commercial LLM APIs (OpenAI, Claude, Gemini) will incur costs based on your usage.
- **Large PDFs**: For very large PDFs (over 100 pages), consider using local models through Ollama to avoid API costs and rate limits.

## Project Structure

- `app.py`: Main Flask application
- `templates/`: HTML templates
- `static/`: Static assets (CSS, JavaScript)
- `uploads/`: Directory for uploaded PDF files
- `temp/`: Directory for temporary files

## Troubleshooting

If you encounter rate limiting issues despite the built-in handling:

1. Reduce the batch size in `app.py` if processing many pages
2. Increase the delay between API calls
3. Try using Ollama for local processing instead of cloud APIs
4. Check your API usage quotas in the respective provider dashboards

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- PDF extraction is based on PyMuPDF (fitz)
- PDF generation is based on ReportLab
- UI uses Bootstrap 5 and Font Awesome 