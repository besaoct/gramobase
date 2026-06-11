import { NextResponse } from 'next/server';
import { getTodosCollection } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const todosCollection = await getTodosCollection();
    
    await todosCollection.findByIdAndUpdate(resolvedParams.id, {
      $set: { completed: body.completed },
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] PATCH /api/todos/${resolvedParams.id} - updated completed to ${body.completed}`);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API] PATCH /api/todos - error:`, error.message);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const todosCollection = await getTodosCollection();
    await todosCollection.deleteById(resolvedParams.id);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] DELETE /api/todos/${resolvedParams.id} - deleted successfully`);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API] DELETE /api/todos - error:`, error.message);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
