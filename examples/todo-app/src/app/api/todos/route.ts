import { NextResponse } from 'next/server';
import { getTodosCollection } from '@/lib/db';

export async function GET() {
  try {
    const todosCollection = await getTodosCollection();
    const todos = await todosCollection.find({
      sort: { createdAt: -1 },
    });
    return NextResponse.json(todos);
  } catch (error: any) {
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
    return NextResponse.json(inserted, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
