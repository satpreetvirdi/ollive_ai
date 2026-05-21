import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://ollive:ollive@localhost:5432/olliveai",
});

export interface Conversation {
  id: string;
  title: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
}

export async function createConversation(title?: string): Promise<Conversation> {
  const { rows } = await pool.query<Conversation>(
    `INSERT INTO conversations (title, status) VALUES ($1, 'active') RETURNING *`,
    [title ?? null]
  );
  return rows[0];
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const { rows } = await pool.query<Conversation>(
    `SELECT * FROM conversations ORDER BY updated_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { rows } = await pool.query<Conversation>(
    `SELECT * FROM conversations WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateConversationStatus(
  id: string,
  status: "active" | "cancelled" | "archived"
): Promise<void> {
  await pool.query(
    `UPDATE conversations SET status = $2, updated_at = NOW() WHERE id = $1`,
    [id, status]
  );
}

export async function updateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  await pool.query(
    `UPDATE conversations SET title = $2, updated_at = NOW() WHERE id = $1`,
    [id, title]
  );
}

export async function getMessages(
  conversationId: string,
  limit = 100
): Promise<Message[]> {
  const { rows } = await pool.query<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit]
  );
  return rows;
}

export async function insertMessage(
  conversationId: string,
  role: Message["role"],
  content: string
): Promise<Message> {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, role, content]
  );
  return rows[0];
}

export { pool };
