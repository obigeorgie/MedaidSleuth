import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and, isNull, or } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number, userId?: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId?: string): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, userId?: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number, userId?: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number, userId?: string) {
    const conditions = userId
      ? and(eq(conversations.id, id), or(eq(conversations.userId, userId), isNull(conversations.userId)))
      : eq(conversations.id, id);
    const [conversation] = await db.select().from(conversations).where(conditions);
    return conversation;
  },

  async getAllConversations(userId?: string) {
    const conditions = userId
      ? or(eq(conversations.userId, userId), isNull(conversations.userId))
      : undefined;
    return db.select().from(conversations).where(conditions).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, userId?: string) {
    const [conversation] = await db.insert(conversations).values({ title, userId: userId || null }).returning();
    return conversation;
  },

  async deleteConversation(id: number, userId?: string) {
    if (userId) {
      const [conversation] = await db.select().from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
      if (!conversation) return;
    }
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};

