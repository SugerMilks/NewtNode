# NewtNode

A local node-based creative workflow app for generating, previewing, saving, and remixing images, video, audio, 3D assets, text, and composition guides while keeping your keys on your machine.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   If you already have the repository locally and just pulled new changes, run `npm install` again before starting the app. This installs any newly added packages and prevents Vite import-resolution errors such as missing `three`.

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Add your local API keys to `.env`:

   ```bash
   FAL_KEY=your_fal_key_here
   GOOGLE_API_KEY=your_google_api_key_here
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://127.0.0.1:5173`.

## One-Click Launch

Windows: double-click `Launch_NewtNode.bat`, or run `Launch_NewtNode.ps1` from PowerShell, to start the local backend, start the Vite UI, and open NewtNode.

macOS: double-click `NewtNode.app` for the app-style launcher, or run `NewtNode.command` when you want terminal logs visible.

## Development Standards

Before adding a new feature, read `docs/node-standards.md`. It is the shared checklist for node behavior, UI conventions, workflow packages, asset storage, backend routes, stats, and verification.

## Named References

Reference images can be renamed in the thumbnail strip. Use those handles in your prompt with `@`, such as `@product` or `@talent`. The app translates your names to Fal's required `@Image1`, `@Image2`, etc. tokens before sending the request.
