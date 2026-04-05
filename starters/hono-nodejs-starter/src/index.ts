import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Hello Hono!</title>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <style>
      * {
        box-sizing: border-box;
      }
      
      body {
        margin: 0;
        padding: 1rem;
        font-family: system-ui, sans-serif;
        color: white;
        background-color: black;
      }
      
      h1 {
        font-weight: 800;
        font-size: 1.5rem;
      }
    </style>
  </head>
  <body>
    <h1>Hello Hono!</h1>
    <p>Showing styled Hono page</p>
  </body>
</html>`;

app.get('/', (c) => {
  return c.html(htmlContent);
});

const port = 3000;
console.log('Server is running on http://localhost:' + port);

serve({
  fetch: app.fetch,
  port,
});
