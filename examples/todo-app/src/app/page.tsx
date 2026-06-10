"use client";

import { useState } from "react";
import { useGramoQuery, useGramoMutation } from "gramobase/react";

type Todo = {
  _id: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

function TodoItem({ todo, mutateTodos, todos }: { todo: Todo, mutateTodos: any, todos: Todo[] }) {
  const toggleMutation = useGramoMutation(`/api/todos/${todo._id}`, 'PATCH', {
    onMutate: () => {
      // Optimistic update
      mutateTodos(todos.map(t => t._id === todo._id ? { ...t, completed: !todo.completed } : t));
    },
    onError: () => {
      // Rollback on failure
      mutateTodos(todos);
    }
  });

  const deleteMutation = useGramoMutation(`/api/todos/${todo._id}`, 'DELETE', {
    onMutate: () => {
      // Optimistic delete
      mutateTodos(todos.filter(t => t._id !== todo._id));
    },
    onError: () => {
      // Rollback on failure
      mutateTodos(todos);
    }
  });

  const isMutating = toggleMutation.isLoading || deleteMutation.isLoading;

  return (
    <li className={`todo-item ${todo.completed ? 'completed' : ''} ${isMutating ? 'mutating' : ''}`}>
      <div className="todo-content" onClick={() => !isMutating && toggleMutation.mutate({ completed: !todo.completed })}>
        <div className="checkbox">
          {todo.completed && (
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 5L4.5 8.5L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="todo-text">{todo.text}</span>
      </div>
      <button 
        className="delete-btn" 
        onClick={() => !isMutating && deleteMutation.mutate({})}
        disabled={isMutating}
        aria-label="Delete"
      >
        {isMutating ? (
           <span className="spinner"></span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        )}
      </button>
    </li>
  );
}

export default function Home() {
  const { data: todos, isLoading, error, mutate } = useGramoQuery<Todo[]>("/api/todos");
  const [inputText, setInputText] = useState("");

  const addMutation = useGramoMutation<Todo, { text: string }>("/api/todos", 'POST', {
    onSuccess: (newTodo) => {
      mutate((prev) => [newTodo, ...(prev || [])]);
      setInputText("");
    }
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || addMutation.isLoading) return;
    addMutation.mutate({ text: inputText });
  };

  return (
    <main className="glass-container">
      <h1>gramotodo.</h1>
      
      <form onSubmit={handleAdd} className="input-group">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="What needs to be done?"
          autoFocus
          disabled={addMutation.isLoading}
        />
        <button type="submit" className="add-btn" disabled={addMutation.isLoading}>
          {addMutation.isLoading ? <span className="spinner"></span> : 'Add'}
        </button>
      </form>

      {error ? (
        <div className="empty-state" style={{ color: 'var(--danger-color)' }}>
          {error.message}
        </div>
      ) : isLoading ? (
        <div className="loading">Loading tasks...</div>
      ) : !todos || todos.length === 0 ? (
        <div className="empty-state">No tasks yet. Add one above!</div>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <TodoItem key={todo._id} todo={todo} todos={todos} mutateTodos={mutate} />
          ))}
        </ul>
      )}
    </main>
  );
}
