import { NextRequest,NextResponse } from "next/server";

export async function GET(request:NextRequest,{params}:{params:{params:{sessionId:string}}}){
    const {sessionId} = params;
    const searchParams = request.nextUrl.searchParams
    const targetUrl = searchParams.get('url');
    if(!targetUrl){
        return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>WebContainer Preview</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 100px auto;
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              text-align: center;
            }
            h1 { color: #333; margin-bottom: 16px; }
            p { color: #666; line-height: 1.6; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">⚠️ Preview Not Available</h1>
            <p>No WebContainer URL provided. Please use the preview button in the playground.</p>
          </div>
        </body>
      </html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      }
    );
    }

    return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>WebContainer Preview - Session ${sessionId}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            overflow: hidden;
            font-family: system-ui, -apple-system, sans-serif;
          }
          
          #preview-frame {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
          }
          
          #loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            z-index: 9999;
          }
          
          #loading.hidden {
            display: none;
          }
          
          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .loading-text {
            margin-top: 20px;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div id="loading">
          <div style="text-align: center;">
            <div class="spinner"></div>
            <div class="loading-text">Loading preview...</div>
          </div>
        </div>
        
        <iframe 
          id="preview-frame"
          src="${targetUrl}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
          allow="cross-origin-isolated"
        ></iframe>
        
        <script>
          const iframe = document.getElementById('preview-frame');
          const loading = document.getElementById('loading');
          
          iframe.addEventListener('load', () => {
            setTimeout(() => {
              loading.classList.add('hidden');
            }, 500);
          });
          
          // Hide loading after 10 seconds regardless
          setTimeout(() => {
            loading.classList.add('hidden');
          }, 10000);
          
          // Handle errors
          iframe.addEventListener('error', () => {
            loading.innerHTML = \`
              <div style="text-align: center; color: #dc2626;">
                <h2>❌ Failed to Load Preview</h2>
                <p style="margin-top: 10px;">The WebContainer app couldn't be loaded.</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">
                  Retry
                </button>
              </div>
            \`;
          });
        </script>
      </body>
    </html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );

}