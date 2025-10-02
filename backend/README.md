# Synapse Backend API

A production-grade FastAPI backend for knowledge management and RAG (Retrieval-Augmented Generation) functionality.

## Features

- **Knowledge Management**: Create, read, update, delete knowledge items
- **Folder Organization**: Hierarchical folder structure for content organization
- **Vector Search**: Semantic search using OpenAI embeddings
- **Text Search**: Traditional text-based search capabilities
- **RAG Chat**: Intelligent chat with context retrieval from knowledge base
- **File Upload**: Support for various file types with automatic content extraction
- **API Key Authentication**: Secure API access with key-based authentication
- **Production Ready**: Comprehensive logging, monitoring, and error handling

## Architecture

The backend follows a clean architecture pattern with clear separation of concerns:

- **API Layer**: FastAPI endpoints with request/response handling
- **Service Layer**: Business logic and operations
- **Data Layer**: Database models and data access
- **Core Layer**: Cross-cutting concerns (auth, storage, embeddings)

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL database (Supabase recommended)
- Redis (optional, for caching)

### Installation

1. Clone the repository and navigate to the backend directory
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (API keys, database settings, etc.)
   ```
5. Start the development server:
   ```bash
   uvicorn app.main:app --reload
   ```
6. Access the API at `http://localhost:8000`
7. View API documentation at `http://localhost:8000/docs`

## API Endpoints

### Authentication
- `POST /api/v1/auth/validate-api-key` - Validate API key

### Content Management
- `POST /api/v1/content/` - Create knowledge item
- `GET /api/v1/content/{id}` - Get knowledge item
- `PUT /api/v1/content/{id}` - Update knowledge item
- `DELETE /api/v1/content/{id}` - Delete knowledge item
- `GET /api/v1/content/` - List knowledge items

### Folder Management
- `GET /api/v1/folders/` - Get folder hierarchy
- `POST /api/v1/folders/` - Create folder
- `GET /api/v1/folders/{id}` - Get folder
- `PUT /api/v1/folders/{id}` - Update folder
- `DELETE /api/v1/folders/{id}` - Delete folder
- `GET /api/v1/folders/{id}/content` - Get folder content

### Search
- `POST /api/v1/search/vector` - Vector search
- `POST /api/v1/search/text` - Text search
- `GET /api/v1/search/` - Unified search

### Chat
- `POST /api/v1/chat/` - RAG chat
- `GET /api/v1/chat/conversations` - Get conversations
- `POST /api/v1/chat/conversations` - Create conversation
- `GET /api/v1/chat/conversations/{id}/messages` - Get messages
- `DELETE /api/v1/chat/conversations/{id}` - Delete conversation

### File Management
- `POST /api/v1/files/upload` - Upload file
- `POST /api/v1/files/process` - Process content
- `GET /api/v1/files/download/{id}` - Download file
- `GET /api/v1/files/status/{id}` - Get processing status

## Configuration

Key environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for embeddings
- `LOVABLE_API_KEY`: Lovable AI API key for chat
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Supabase configuration
- `REDIS_URL`: Redis connection for caching
- `SECRET_KEY`: Application secret key

See `.env.example` for complete configuration options.

## Storage Backends

The backend supports multiple storage backends:

- **Supabase Storage** (default)
- **AWS S3**
- **Google Cloud Storage**
- **Local Storage**

Configure via `STORAGE_BACKEND` environment variable.

## Testing

Run the test suite:

```bash
pytest
```

With coverage:

```bash
pytest --cov=app --cov-report=html
```

## Deployment

### Production Deployment

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set production environment variables in `.env`:
   ```bash
   ENVIRONMENT=production
   DATABASE_URL=your_production_database_url
   SECRET_KEY=your_production_secret_key
   # ... other production settings
   ```

3. Run with Gunicorn:
   ```bash
   gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
   ```

## Monitoring

- Health check endpoint: `/health`
- Prometheus metrics: `/metrics`
- Structured logging with correlation IDs
- Sentry integration for error tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite and linting
6. Submit a pull request

## License

MIT License - see LICENSE file for details.