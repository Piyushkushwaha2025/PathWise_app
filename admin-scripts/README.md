# StudyOS RAG Admin Scripts

This folder contains the tools to ingest your course PDFs (converted from PPTs) into the Pinecone Vector Database, enabling the StudyOS AI Tutor to search and answer questions based directly on your syllabus materials.

## Setup Instructions

1. **Install Dependencies**
   Make sure you have Node.js installed, then run:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Rename `.env.example` to `.env`.
   Fill in your actual API keys:
   - `PINECONE_API_KEY`: Get this from pinecone.io
   - `GEMINI_API_KEY`: Get this from Google AI Studio (aistudio.google.com)
   - `PINECONE_INDEX_NAME`: Ensure your Pinecone index is named exactly this (e.g. `studyos-index`). The index should have a **dimension of 768** and use the **cosine** metric.

3. **Prepare Your PDFs**
   - Create a folder named `data` in this directory: `mkdir data`
   - Place your subject PDFs inside the `data` folder.
   - **Tip:** Name the files starting with the subject code (e.g., `COA_Unit1.pdf`, `PYTHON_Unit2.pdf`) so the script can tag the data correctly.

4. **Run the Ingestion Script**
   Run the following command to chunk the PDFs, create embeddings, and upload them to Pinecone:
   ```bash
   npm start
   ```

The script will automatically process all PDFs in the `data` folder and notify you once the vectors are securely uploaded to Pinecone!
