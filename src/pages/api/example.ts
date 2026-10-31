import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  
  const result = await db.prepare('SELECT * FROM users LIMIT 10').all();
  
  return new Response(JSON.stringify(result.results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime.env.DB;
  const body = await request.json();
  
  const result = await db.prepare(
    'INSERT INTO users (name, email) VALUES (?, ?)'
  ).bind(body.name, body.email).run();
  
  return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
};
