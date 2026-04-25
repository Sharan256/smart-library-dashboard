# Smart Library Analytics Dashboard

A complete React frontend for the Assignment 02 smart library visual analytics project.

## Features

- Role-based login for **Student** and **Library Assistant**
- Interactive dashboards built from the provided smart library CSV dataset
- Shared filter system for date, zone, day, and time range
- Student views for:
  - Overview
  - Zone Explorer
  - Visit Planner
  - Recommendation Center
- Library Assistant views for:
  - Operations Overview
  - Zone Monitoring
  - Alerts & Issues
  - Resource Planning
- Coordinated visualizations with comparisons, trends, and drill-down support
- Local authentication with demo users
- Clean modular React structure for easy extension
- Chatbot-ready layout for future integration

## Demo Credentials

- Student: `student` / `student123`
- Assistant: `assistant` / `assistant123`

## Run the Project

```bash
npm install
npm run dev
```

## Backend Chatbot Proxy

The chatbot uses a backend proxy to keep your Hugging Face API key secure.

1. Install backend requirements:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Create a `.env` file with your Hugging Face API key:

```env
HUGGINGFACE_API_KEY=your_huggingface_api_token_here
```

> Important: `.env` is excluded by `.gitignore` and should never be committed to Git.

3. Start the backend:

```bash
python app.py
```

The frontend sends chat requests to `http://localhost:5000/api/chat`. The backend proxies them to the Hugging Face inference API.

## Build for Production

```bash
npm run build
npm run preview
```

## Dataset Location

The CSV file is included in:

```bash
public/data/library_data.csv
```

## Tech Stack

- React
- React Router
- Recharts
- Vite

## Notes

- This is a frontend-focused implementation using the real uploaded CSV dataset.
- Authentication is demo-only and stored in localStorage.
- The project is structured so a backend API and chatbot module can be added later without rewriting the UI.
