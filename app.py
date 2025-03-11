import os
import io
import json
import tempfile
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import PyPDF2
from PyPDF2 import PdfReader, PdfWriter
import requests
import httpx
import anthropic
from openai import OpenAI
import subprocess
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import asyncio
import fitz  # PyMuPDF
import re
import time
import random
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='static')
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
TEMP_FOLDER = 'temp'
ALLOWED_EXTENSIONS = {'pdf'}

# Get API keys from environment variables with fallbacks
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# Get port from environment variables
PORT = int(os.environ.get('PORT', 5000))

# Create necessary directories
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TEMP_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload size

# Utility functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(file_path):
    """Extract text from PDF file using PyMuPDF (fitz) for better text extraction"""
    text_blocks = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Extract text blocks (paragraphs) with their positions
            blocks = page.get_text("blocks")
            for block in blocks:
                if block[4].strip():  # Check if the block has text
                    text_blocks.append(block[4])
        doc.close()
        return text_blocks
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return []

def translate_with_ollama(text, target_language, model_name):
    """Translate text using Ollama models with retry logic"""
    max_retries = 2
    retry_delay = 2  # Initial delay in seconds
    
    for attempt in range(max_retries):
        try:
            prompt = f"Translate the following text to {target_language}. Preserve paragraph structure and formatting. Only return the translated text without any additional comments:\n\n{text}"
            command = ['ollama', 'run', model_name]
            
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            output, error = process.communicate(input=prompt, timeout=60)
            
            if process.returncode != 0:
                if attempt < max_retries - 1:
                    sleep_time = retry_delay * (2 ** attempt)
                    print(f"Ollama error, retrying in {sleep_time} seconds... Error: {error}")
                    time.sleep(sleep_time)
                    continue
                print(f"Error running Ollama model: {error}")
                return None
            
            return output
        except subprocess.TimeoutExpired:
            process.kill()
            if attempt < max_retries - 1:
                sleep_time = retry_delay
                print(f"Ollama timeout, retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
            else:
                print("Ollama process timed out repeatedly")
                return None
        except Exception as e:
            if attempt < max_retries - 1:
                sleep_time = retry_delay
                print(f"Ollama error, retrying in {sleep_time} seconds... Error: {e}")
                time.sleep(sleep_time)
            else:
                print(f"Error translating with Ollama: {e}")
                return None
    
    return None

def translate_with_openai(text, target_language, api_key):
    """Translate text using OpenAI API with retry logic"""
    max_retries = 3
    retry_delay = 1  # Initial delay in seconds
    
    for attempt in range(max_retries):
        try:
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4o",  # Using GPT-4o for high-quality translations
                messages=[
                    {"role": "system", "content": f"You are a professional translator. Translate the following text to {target_language}. Only return the translated text without any additional comments."},
                    {"role": "user", "content": text}
                ],
                temperature=0.3
            )
            return response.choices[0].message.content
        except Exception as e:
            if attempt < max_retries - 1:  # Don't sleep on the last attempt
                sleep_time = retry_delay * (2 ** attempt) + random.uniform(0, 1)
                print(f"OpenAI API error, retrying in {sleep_time:.2f} seconds... Error: {e}")
                time.sleep(sleep_time)
            else:
                print(f"Error translating with OpenAI: {e}")
                return None
    
    return None

def translate_with_claude(text, target_language, api_key):
    """Translate text using Claude API with retry logic"""
    max_retries = 3
    retry_delay = 1  # Initial delay in seconds
    
    for attempt in range(max_retries):
        try:
            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4000,
                messages=[
                    {"role": "user", "content": f"Translate the following text to {target_language}. Only return the translated text without any additional comments:\n\n{text}"}
                ]
            )
            return message.content[0].text
        except Exception as e:
            if attempt < max_retries - 1:  # Don't sleep on the last attempt
                sleep_time = retry_delay * (2 ** attempt) + random.uniform(0, 1)
                print(f"Claude API error, retrying in {sleep_time:.2f} seconds... Error: {e}")
                time.sleep(sleep_time)
            else:
                print(f"Error translating with Claude: {e}")
                return None
    
    return None

async def translate_with_gemini(text, target_language, api_key):
    """Translate text using Gemini API with retry logic"""
    max_retries = 3
    retry_delay = 2  # Initial delay in seconds
    
    for attempt in range(max_retries):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            headers = {'Content-Type': 'application/json'}
            payload = {
                "contents": [{
                    "parts": [{"text": f"Translate the following text to {target_language}. Only return the translated text without any additional comments:\n\n{text}"}]
                }]
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code == 429:
                    # Rate limit hit, implement exponential backoff
                    if attempt < max_retries - 1:  # Don't sleep on the last attempt
                        sleep_time = retry_delay * (2 ** attempt) + random.uniform(0, 1)
                        print(f"Rate limit hit, retrying in {sleep_time:.2f} seconds...")
                        await asyncio.sleep(sleep_time)
                        continue
                
                response.raise_for_status()
                data = response.json()

                if "candidates" in data and len(data["candidates"]) > 0:
                    candidate = data["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        return candidate["content"]["parts"][0]["text"]
                return None
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < max_retries - 1:
                # Rate limit hit, implement exponential backoff
                sleep_time = retry_delay * (2 ** attempt) + random.uniform(0, 1)
                print(f"Rate limit hit, retrying in {sleep_time:.2f} seconds...")
                await asyncio.sleep(sleep_time)
            else:
                print(f"Error translating with Gemini: {e}")
                return None
        except Exception as e:
            print(f"Error translating with Gemini: {e}")
            return None
    
    return None

def create_translated_pdf(translated_texts, output_path):
    """Create a PDF with the translated text"""
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter
    
    # Register Vazir font for Persian text
    font_path = os.path.join(os.path.dirname(__file__), 'static', 'fonts', 'Vazir.ttf')
    try:
        pdfmetrics.registerFont(TTFont('Vazir', font_path))
        font_name = 'Vazir'
    except:
        print("Warning: Vazir font not found, falling back to Helvetica")
        font_name = 'Helvetica'
    
    c.setFont(font_name, 12)
    
    y = height - 50  # Start from top with margin
    for text in translated_texts:
        # Split text into paragraphs
        paragraphs = text.split('\n')
        for paragraph in paragraphs:
            # Calculate text width and wrap text
            words = paragraph.split()
            line = ""
            for word in words:
                test_line = line + " " + word if line else word
                width_of_line = c.stringWidth(test_line, font_name, 12)
                
                if width_of_line < width - 100:  # Margin of 50 on each side
                    line = test_line
                else:
                    # Draw text from right to left for Persian
                    text_width = c.stringWidth(line, font_name, 12)
                    c.drawString(width - 50 - text_width, y, line)  # Right-aligned
                    y -= 15  # Line spacing
                    line = word
                    
                    if y < 50:  # Bottom margin
                        c.showPage()
                        y = height - 50
                        c.setFont(font_name, 12)
            
            if line:  # Draw the last line
                text_width = c.stringWidth(line, font_name, 12)
                c.drawString(width - 50 - text_width, y, line)  # Right-aligned
                y -= 15
            
            y -= 10  # Extra space between paragraphs
            
            if y < 50:  # Bottom margin
                c.showPage()
                y = height - 50
                c.setFont(font_name, 12)
    
    c.save()

# Routes
@app.route('/')
def index():
    # Detect user language preference from Accept-Language header
    user_language = request.accept_languages.best_match(['en', 'fa']) or 'en'
    
    # Pass default API keys if available
    api_keys = {
        'openai': OPENAI_API_KEY != '',
        'claude': CLAUDE_API_KEY != '',
        'gemini': GEMINI_API_KEY != ''
    }
    return render_template('index.html', api_keys=api_keys, user_language=user_language)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        try:
            # Secure the filename to prevent security issues
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # Save the file
            file.save(file_path)
            
            # Check if file was saved correctly
            if not os.path.exists(file_path):
                return jsonify({'error': 'Failed to save the file'}), 500
                
            # Extract text from PDF
            text_blocks = extract_text_from_pdf(file_path)
            
            if not text_blocks:
                return jsonify({'error': 'Could not extract text from the PDF. The file might be corrupted or empty.'}), 400
            
            # Return text blocks with their IDs for frontend display
            result = {
                'filename': filename,
                'file_path': file_path,
                'text_blocks': [{'id': i, 'text': block} for i, block in enumerate(text_blocks)]
            }
            
            return jsonify(result)
        except Exception as e:
            app.logger.error(f"Error processing file: {str(e)}")
            return jsonify({'error': f'Error processing file: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type. Only PDF files are allowed.'}), 400

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json
    
    if not data or 'text_blocks' not in data or 'target_language' not in data:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    text_blocks = data['text_blocks']
    target_language = data['target_language']
    llm_provider = data.get('llm_provider', 'openai')
    api_key = data.get('api_key', '')
    model_name = data.get('model_name', 'llama3.1')  # Default for Ollama
    
    # Use environment variables as fallback if no API key provided
    if not api_key:
        if llm_provider == 'openai' and OPENAI_API_KEY:
            api_key = OPENAI_API_KEY
        elif llm_provider == 'claude' and CLAUDE_API_KEY:
            api_key = CLAUDE_API_KEY
        elif llm_provider == 'gemini' and GEMINI_API_KEY:
            api_key = GEMINI_API_KEY
    
    # Check if API key is required and available
    if llm_provider != 'ollama' and not api_key:
        return jsonify({'error': f'API key is required for {llm_provider.upper()}'}), 400
    
    translated_blocks = []
    
    # Limit batch size to avoid overloading the APIs
    batch_size = 5
    for i in range(0, len(text_blocks), batch_size):
        batch = text_blocks[i:i+batch_size]
        batch_results = []
        
        for block in batch:
            text = block['text']
            
            if llm_provider == 'openai':
                translated_text = translate_with_openai(text, target_language, api_key)
            
            elif llm_provider == 'claude':
                translated_text = translate_with_claude(text, target_language, api_key)
            
            elif llm_provider == 'gemini':
                translated_text = asyncio.run(translate_with_gemini(text, target_language, api_key))
            
            elif llm_provider == 'ollama':
                translated_text = translate_with_ollama(text, target_language, model_name)
            
            else:
                return jsonify({'error': 'Unsupported LLM provider'}), 400
            
            if translated_text:
                batch_results.append({
                    'id': block['id'],
                    'original': text,
                    'translated': translated_text
                })
            else:
                batch_results.append({
                    'id': block['id'],
                    'original': text,
                    'translated': f"Error translating this paragraph with {llm_provider}."
                })
        
        translated_blocks.extend(batch_results)
        
        # Add delay between batches to avoid rate limiting
        if i + batch_size < len(text_blocks):
            time.sleep(1)
    
    return jsonify({
        'target_language': target_language,
        'translated_blocks': translated_blocks
    })

@app.route('/generate-pdf', methods=['POST'])
def generate_pdf():
    data = request.json
    
    if not data or 'translated_blocks' not in data:
        return jsonify({'error': 'Missing translated blocks'}), 400
    
    translated_blocks = [block['translated'] for block in data['translated_blocks']]
    
    # Create a unique temporary filename
    output_filename = f"translated_{tempfile.mktemp(suffix='.pdf', dir='')}"
    output_path = os.path.join(TEMP_FOLDER, output_filename)
    
    # Create the PDF with translated content
    create_translated_pdf(translated_blocks, output_path)
    
    # Return the path to the generated PDF
    return jsonify({
        'pdf_url': f'/download/{output_filename}'
    })

@app.route('/download/<filename>')
def download_file(filename):
    return send_file(os.path.join(TEMP_FOLDER, filename), 
                     mimetype='application/pdf',
                     as_attachment=True,
                     download_name=f"translated_{filename}")

@app.route('/available-models', methods=['GET'])
def available_models():
    """Return a list of available Ollama models"""
    try:
        result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        models = []
        
        if result.returncode == 0:
            # Parse the output to extract model names
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:  # Skip header line
                for line in lines[1:]:
                    parts = line.split()
                    if parts:
                        models.append(parts[0])
        
        return jsonify({'models': models})
    except Exception as e:
        print(f"Error getting Ollama models: {e}")
        return jsonify({'models': ['llama3.1', 'gemma-2-9b', 'qwen2.5', 'mistral'], 'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=PORT) 