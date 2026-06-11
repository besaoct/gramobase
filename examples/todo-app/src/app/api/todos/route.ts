import { NextResponse } from 'next/server';
import { getTodosCollection } from '@/lib/db';

export async function GET() {
  try {
    const todosCollection = await getTodosCollection();
    const todos = await todosCollection.find({
      sort: { createdAt: -1 },
    });
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] GET /api/todos - serving ${todos.length} items`);
    }
    return NextResponse.json(todos);
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API] GET /api/todos - error:`, error.message);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const todosCollection = await getTodosCollection();
    
    const newTodo = {
      text: body.text,
      completed: false,
      createdAt: Date.now(),
    };
    
    const inserted = await todosCollection.insertOne(newTodo);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] POST /api/todos - inserted: "${inserted.text}" (_id: ${inserted._id})`);
    }
    return NextResponse.json(inserted, { status: 201 });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API] POST /api/todos - error:`, error.message);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
