@echo off
cd /d "%~dp0"
echo Starting BLOG affiliate...
start http://localhost:8501
py -m streamlit run scripts/affiliate_app.py --server.port 8501 --server.headless true --browser.gatherUsageStats false
