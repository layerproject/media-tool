# Layer Media Tool

Desktop app for capturing and processing Layer artworks. Features include:

- Search and browse artworks from Layer
- Capture video recordings of generative artworks
- Extract frames from artworks
- Process videos for web (multiple codecs/resolutions)
- Upload/download to Bunny CDN

## Building Locally

### Prerequisites

- Node.js v16+
- FFmpeg installed

### Environment Variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Install & Run

```bash
npm install
npm start
```

### Build for Distribution

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

## License

MIT
