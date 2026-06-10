@echo off
echo ========================================================
echo Academic Compass Backend Setup ^& Run
echo ========================================================
echo.

cd /d "%~dp0"

:: Check if Python is installed and accessible
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Python is not recognized. Please install Python and add it to PATH.
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment venv...
    python -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to create virtual environment!
        pause
        exit /b 1
    )
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing dependencies...
python -m pip install --upgrade pip
pip install fastapi uvicorn pydantic python-multipart requests pypdf numpy pandas scipy scikit-learn faiss-cpu sentencepiece torch transformers bert-extractive-summarizer

echo.
echo Starting FastAPI Server on port 8000...
echo.
python main.py
pause
