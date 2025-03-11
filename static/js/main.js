document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const selectedFile = document.getElementById('selectedFile');
    const fileName = document.getElementById('fileName');
    const removeFile = document.getElementById('removeFile');
    const translateBtn = document.getElementById('translateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const llmSelect = document.getElementById('llmSelect');
    const apiKey = document.getElementById('apiKey');
    const apiKeyHelp = document.getElementById('apiKeyHelp');
    const targetLanguage = document.getElementById('targetLanguage');
    const originalText = document.getElementById('originalText');
    const translatedText = document.getElementById('translatedText');
    const initialState = document.getElementById('initialState');
    const loadingState = document.getElementById('loadingState');
    const textViewer = document.getElementById('textViewer');
    const loadingMessage = document.getElementById('loadingMessage');
    const progressBar = document.getElementById('progressBar');
    const modelSelectContainer = document.getElementById('modelSelectContainer');
    const modelSelect = document.getElementById('modelSelect');
    const toggleLanguageBtn = document.getElementById('toggleLanguage');
    const languageText = document.getElementById('languageText');
    
    // Bootstrap Toasts
    const errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
    const successToast = new bootstrap.Toast(document.getElementById('successToast'));
    const errorToastMessage = document.getElementById('errorToastMessage');
    const successToastMessage = document.getElementById('successToastMessage');
    
    // State variables
    let uploadedFile = null;
    let extractedTextBlocks = [];
    let translatedBlocks = [];
    let pdfUrl = null;
    
    // Check local storage for saved API keys
    const savedApiKey = localStorage.getItem('pdfTranslator_apiKey');
    if (savedApiKey) {
        apiKey.value = savedApiKey;
    }
    
    // Handle file upload via drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];
            handleFileSelection(file);
        }
    });
    
    // Handle file upload via file input
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function(event) {
        if (fileInput.files.length) {
            handleFileSelection(fileInput.files[0]);
        }
    });
    
    // Handle file removal
    removeFile.addEventListener('click', function() {
        resetFileUpload();
    });
    
    // Handle LLM selection change
    llmSelect.addEventListener('change', function() {
        const selectedLLM = llmSelect.value;
        
        // Toggle model selection for Ollama
        if (selectedLLM === 'ollama') {
            modelSelectContainer.style.display = 'block';
            fetchAvailableModels();
            
            // Enable/disable API key based on provider
            apiKey.disabled = true;
            apiKey.placeholder = 'Not required for Ollama';
            apiKeyHelp.textContent = 'API key not required for local Ollama models';
        } else {
            modelSelectContainer.style.display = 'none';
            
            // Check if we have pre-configured keys
            const hasPreConfiguredKey = checkForPreConfiguredKey(selectedLLM);
            
            apiKey.disabled = false;
            if (hasPreConfiguredKey) {
                apiKey.placeholder = `Pre-configured ${selectedLLM.toUpperCase()} key available`;
                apiKeyHelp.textContent = `You can use the pre-configured ${selectedLLM.toUpperCase()} key or enter your own`;
            } else {
                apiKey.placeholder = 'Enter your API key';
                apiKeyHelp.textContent = `API key required for ${selectedLLM.toUpperCase()}`;
            }
        }
    });
    
    // Save API key to local storage when user enters it
    apiKey.addEventListener('change', function() {
        if (apiKey.value.trim()) {
            localStorage.setItem('pdfTranslator_apiKey', apiKey.value);
        }
    });
    
    // Handle translation button click
    translateBtn.addEventListener('click', function() {
        // Validate inputs
        if (!validateInputs()) {
            return;
        }
        
        // Start translation process
        translatePDF();
    });
    
    // Handle download button click
    downloadBtn.addEventListener('click', function() {
        if (pdfUrl) {
            window.location.href = pdfUrl;
            
            showSuccessToast(translate('downloadStarted'));
        } else {
            showErrorToast(translate('noPdfAvailable'));
        }
    });
    
    // Fetch available Ollama models
    function fetchAvailableModels() {
        fetch('/available-models')
            .then(response => response.json())
            .then(data => {
                if (data.models && data.models.length > 0) {
                    // Clear and populate model select
                    modelSelect.innerHTML = '';
                    data.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        modelSelect.appendChild(option);
                    });
                } else {
                    modelSelect.innerHTML = '<option value="llama3.1">llama3.1</option>';
                }
            })
            .catch(error => {
                console.error('Error fetching models:', error);
                modelSelect.innerHTML = '<option value="llama3.1">llama3.1</option>';
            });
    }
    
    // Translation strings for error messages (English and Persian)
    const translations = {
        en: {
            uploadPdfPlease: 'Please upload a PDF file',
            fileTooLarge: 'PDF file is too large. Maximum size is 50MB.',
            noTextExtracted: 'No text could be extracted from the PDF',
            apiKeyRequired: 'API key is required for',
            processingFailed: 'Failed to process PDF',
            rateLimit: 'Rate limit exceeded. Please try again later or use smaller files.',
            invalidApiKey: 'Invalid API key. Please check your key and try again.',
            errorTranslating: 'Failed to translate PDF',
            paragraphsFailedHigh: 'Warning: {0} out of {1} paragraphs failed to translate. The result may be incomplete.',
            paragraphsFailedLow: '{0} paragraphs could not be translated due to API errors.',
            rateLimitProvider: 'Rate limit exceeded. Try again later or switch to a different LLM provider.',
            successExtracted: 'Successfully extracted {0} text blocks from PDF',
            translationComplete: 'Translation completed successfully!',
            downloadStarted: 'Your translated PDF is being downloaded',
            noPdfAvailable: 'No translated PDF available for download'
        },
        fa: {
            uploadPdfPlease: 'لطفاً یک فایل PDF آپلود کنید',
            fileTooLarge: 'فایل PDF بسیار بزرگ است. حداکثر اندازه ۵۰ مگابایت است.',
            noTextExtracted: 'هیچ متنی از PDF استخراج نشد',
            apiKeyRequired: 'کلید API برای {0} مورد نیاز است',
            processingFailed: 'پردازش PDF با مشکل مواجه شد',
            rateLimit: 'محدودیت تعداد درخواست. لطفاً بعداً دوباره امتحان کنید یا از فایل‌های کوچکتر استفاده کنید.',
            invalidApiKey: 'کلید API نامعتبر است. لطفاً کلید خود را بررسی کنید و دوباره امتحان کنید.',
            errorTranslating: 'ترجمه PDF با مشکل مواجه شد',
            paragraphsFailedHigh: 'هشدار: {0} از {1} پاراگراف ترجمه نشدند. نتیجه ممکن است ناقص باشد.',
            paragraphsFailedLow: '{0} پاراگراف به دلیل خطاهای API قابل ترجمه نبودند.',
            rateLimitProvider: 'محدودیت تعداد درخواست برای {0}. بعداً امتحان کنید یا از ارائه‌دهنده LLM دیگری استفاده کنید.',
            successExtracted: '{0} بلوک متنی با موفقیت از PDF استخراج شد',
            translationComplete: 'ترجمه با موفقیت انجام شد!',
            downloadStarted: 'PDF ترجمه شده در حال دانلود است',
            noPdfAvailable: 'هیچ PDF ترجمه شده‌ای برای دانلود موجود نیست'
        }
    };

    // Detect language - defaults to English
    const userLanguage = document.documentElement.lang === 'fa' ? 'fa' : 'en';

    // Translate a message key with optional parameters
    function translate(key, ...params) {
        let message = translations[userLanguage][key] || translations.en[key] || key;
        
        // Replace placeholders like {0}, {1} with actual parameters
        params.forEach((param, index) => {
            message = message.replace(`{${index}}`, param);
        });
        
        return message;
    }
    
    // Handle file selection
    function handleFileSelection(file) {
        // Validate file type
        if (!file.type.includes('pdf')) {
            showErrorToast(translate('uploadPdfPlease'));
            return;
        }
        
        // Update UI immediately to give feedback to the user
        uploadedFile = file;
        fileName.textContent = file.name;
        uploadArea.style.display = 'none';
        selectedFile.style.display = 'flex';
        translateBtn.disabled = true; // Keep disabled until text extraction is complete
        
        // Show loading state
        setLoadingState('Extracting text from PDF...');
        
        // Prepare form data for upload
        const formData = new FormData();
        formData.append('file', file);
        
        // Upload file to server
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 413) {
                    throw new Error(translate('fileTooLarge'));
                }
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Store extracted text blocks
            extractedTextBlocks = data.text_blocks;
            
            // Update loading state
            if (extractedTextBlocks.length === 0) {
                throw new Error(translate('noTextExtracted'));
            }
            
            // Enable translate button now that we have text
            translateBtn.disabled = false;
            
            // Return to default state and show success message
            setDefaultState();
            showSuccessToast(translate('successExtracted', extractedTextBlocks.length));
        })
        .catch(error => {
            console.error('Error uploading file:', error);
            resetFileUpload();
            showErrorToast(error.message || translate('processingFailed'));
        });
    }
    
    // Validate inputs before translation
    function validateInputs() {
        // Check if file is uploaded
        if (!uploadedFile) {
            showErrorToast(translate('uploadPdfPlease'));
            return false;
        }
        
        // Check if text was extracted
        if (extractedTextBlocks.length === 0) {
            showErrorToast(translate('noTextExtracted'));
            return false;
        }
        
        // Check if we need an API key
        const selectedLLM = llmSelect.value;
        
        if (selectedLLM !== 'ollama') {
            // Check if we have this provider's pre-configured key
            const hasPreConfiguredKey = checkForPreConfiguredKey(selectedLLM);
            
            // If no pre-configured key and no user-provided key, show error
            if (!hasPreConfiguredKey && !apiKey.value.trim()) {
                showErrorToast(translate('apiKeyRequired', selectedLLM.toUpperCase()));
                apiKey.focus();
                return false;
            }
        }
        
        return true;
    }
    
    // Helper function to check for pre-configured keys
    function checkForPreConfiguredKey(provider) {
        // Capitalize first letter for badge text
        const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
        
        // Find all badge elements
        const badges = document.querySelectorAll('.badge.bg-success');
        
        // Check if any badge contains the provider name
        for (let i = 0; i < badges.length; i++) {
            if (badges[i].textContent.trim() === capitalizedProvider) {
                return true;
            }
        }
        
        return false;
    }
    
    // Translate the PDF
    function translatePDF() {
        setLoadingState('Translating text...');
        progressBar.style.width = '0%';
        
        // Show a message about potential delays for many paragraphs
        if (extractedTextBlocks.length > 20) {
            loadingMessage.textContent = `Translating ${extractedTextBlocks.length} paragraphs... This may take a few minutes`;
        }
        
        // Prepare request data
        const requestData = {
            text_blocks: extractedTextBlocks,
            target_language: targetLanguage.value,
            llm_provider: llmSelect.value,
            api_key: apiKey.value
        };
        
        // Add model name for Ollama
        if (llmSelect.value === 'ollama') {
            requestData.model_name = modelSelect.value;
        }
        
        // Send translation request
        fetch('/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error(translate('rateLimit'));
                } else if (response.status === 403) {
                    throw new Error(translate('invalidApiKey'));
                }
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Check for high error rate
            const errorCount = data.translated_blocks.filter(block => 
                block.translated.includes('Error translating this paragraph')
            ).length;
            
            const errorRate = errorCount / data.translated_blocks.length;
            
            if (errorRate > 0.5) {
                showErrorToast(translate('paragraphsFailedHigh', errorCount, data.translated_blocks.length));
            } else if (errorCount > 0) {
                showErrorToast(translate('paragraphsFailedLow', errorCount));
            }
            
            // Store translated blocks
            translatedBlocks = data.translated_blocks;
            
            // Update UI to show translations
            displayTranslations();
            
            // Generate PDF
            generatePDF();
        })
        .catch(error => {
            console.error('Error translating PDF:', error);
            setDefaultState();
            
            // Provide more helpful error messages based on provider
            if (error.message.includes('rate limit') || error.message.includes('429')) {
                const provider = llmSelect.value.toUpperCase();
                showErrorToast(translate('rateLimitProvider', provider));
            } else if (error.message.includes('API key')) {
                showErrorToast(translate('invalidApiKey'));
            } else {
                showErrorToast(error.message || translate('errorTranslating'));
            }
        });
    }
    
    // Generate PDF from translations
    function generatePDF() {
        setLoadingState('Generating PDF...');
        progressBar.style.width = '66%';
        
        // Prepare request data
        const requestData = {
            translated_blocks: translatedBlocks
        };
        
        // Send PDF generation request
        fetch('/generate-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Store PDF URL
            pdfUrl = data.pdf_url;
            
            // Update UI
            progressBar.style.width = '100%';
            downloadBtn.disabled = false;
            
            // Show success message
            showSuccessToast(translate('translationComplete'));
            
            // Return to default state after a short delay
            setTimeout(() => {
                setTextViewerState();
            }, 1000);
        })
        .catch(error => {
            console.error('Error generating PDF:', error);
            setTextViewerState();
            showErrorToast(error.message || translate('errorTranslating'));
        });
    }
    
    // Display translations in the UI
    function displayTranslations() {
        // Clear existing content
        originalText.innerHTML = '';
        translatedText.innerHTML = '';
        
        // Add each text block
        translatedBlocks.forEach(block => {
            // Original text paragraph
            const originalPara = document.createElement('div');
            originalPara.className = 'paragraph-item';
            originalPara.innerHTML = `
                <div class="original">${formatText(block.original)}</div>
            `;
            originalText.appendChild(originalPara);
            
            // Translated text paragraph
            const translatedPara = document.createElement('div');
            translatedPara.className = 'paragraph-item';
            translatedPara.innerHTML = `
                <div class="translated">${formatText(block.translated)}</div>
            `;
            translatedText.appendChild(translatedPara);
        });
    }
    
    // Helper function to format text for display
    function formatText(text) {
        if (!text) return '';
        
        // Replace newlines with <br> tags
        return text.replace(/\n/g, '<br>');
    }
    
    // Reset file upload state
    function resetFileUpload() {
        uploadedFile = null;
        extractedTextBlocks = [];
        translatedBlocks = [];
        pdfUrl = null;
        
        // Reset UI
        fileInput.value = '';
        uploadArea.style.display = 'block';
        selectedFile.style.display = 'none';
        translateBtn.disabled = true;
        downloadBtn.disabled = true;
        
        // Reset view state
        setDefaultState();
    }
    
    // Set the UI to default state
    function setDefaultState() {
        initialState.style.display = 'flex';
        loadingState.style.display = 'none';
        textViewer.style.display = 'none';
    }
    
    // Set the UI to loading state
    function setLoadingState(message) {
        initialState.style.display = 'none';
        loadingState.style.display = 'flex';
        textViewer.style.display = 'none';
        
        loadingMessage.textContent = message || 'Processing...';
    }
    
    // Set the UI to text viewer state
    function setTextViewerState() {
        initialState.style.display = 'none';
        loadingState.style.display = 'none';
        textViewer.style.display = 'block';
    }
    
    // Show error toast notification with configurable options
    function showErrorToast(message, duration = 5000) {
        errorToastMessage.textContent = message;
        
        // Set a custom duration for the toast
        const toastInstance = new bootstrap.Toast(document.getElementById('errorToast'), {
            delay: duration
        });
        
        toastInstance.show();
    }
    
    // Show success toast notification
    function showSuccessToast(message) {
        successToastMessage.textContent = message;
        successToast.show();
    }
    
    // Language toggle button
    toggleLanguageBtn.addEventListener('click', function() {
        // Toggle language
        const currentLang = document.documentElement.lang;
        const newLang = currentLang === 'fa' ? 'en' : 'fa';
        
        // Update HTML lang attribute
        document.documentElement.lang = newLang;
        
        // Update button text
        languageText.textContent = newLang === 'fa' ? 'English' : 'فارسی';
        
        // Save preference
        localStorage.setItem('pdfTranslator_language', newLang);
        
        // Update UI text elements based on new language
        updateUILanguage();
        
        // You could also reload the page to apply language change completely
        // location.reload();
    });
    
    // Check for saved language preference
    const savedLanguage = localStorage.getItem('pdfTranslator_language');
    if (savedLanguage && savedLanguage !== document.documentElement.lang) {
        document.documentElement.lang = savedLanguage;
        languageText.textContent = savedLanguage === 'fa' ? 'English' : 'فارسی';
        updateUILanguage();
    }
    
    // Update UI language elements
    function updateUILanguage() {
        const lang = document.documentElement.lang;
        const isRtl = lang === 'fa';
        
        // Add RTL support if language is Farsi
        if (isRtl) {
            document.body.classList.add('rtl');
            document.querySelectorAll('.form-label, h1, h2, h3, p, .btn').forEach(el => {
                el.style.fontFamily = "Tahoma, Arial, sans-serif";
            });
        } else {
            document.body.classList.remove('rtl');
            document.querySelectorAll('.form-label, h1, h2, h3, p, .btn').forEach(el => {
                el.style.fontFamily = "";
            });
        }
        
        // Update static UI elements
        updateElementText('apiKeyHelp', isRtl ? 'مورد نیاز برای OpenAI، Claude و Gemini' : 'Required for OpenAI, Claude, and Gemini');
        
        // Also update loading message if in loading state
        if (loadingState.style.display !== 'none') {
            loadingMessage.textContent = isRtl ? 'در حال پردازش PDF...' : 'Processing PDF...';
        }
    }
    
    // Helper function to update text content if element exists
    function updateElementText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }
    
    // Initialize UI language
    updateUILanguage();
    
    // Initialize the UI
    setDefaultState();
    
    // Check if we should show Ollama model options
    if (llmSelect.value === 'ollama') {
        modelSelectContainer.style.display = 'block';
        fetchAvailableModels();
    }
}); 