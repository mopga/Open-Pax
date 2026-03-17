"""
Open-Pax — Main Application
===========================
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes


def create_app() -> FastAPI:
    """Создать приложение"""
    
    app = FastAPI(
        title="Open-Pax API",
        description="AI-Powered Alternate History Simulator",
        version="0.1.0"
    )
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Роуты
    app.include_router(routes.app, prefix="/api/v1", tags=["game"])
    
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
