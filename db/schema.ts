import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const orders=sqliteTable('mimipip_orders',{
 id:text('id').primaryKey(),tokenHash:text('token_hash').notNull().unique(),
 status:text('status').notNull(),amount:integer('amount').notNull(),shipping:integer('shipping').notNull(),
 customer:text('customer').notNull(),fulfilment:text('fulfilment').notNull(),
 razorpayOrderId:text('razorpay_order_id').unique(),paymentId:text('payment_id').unique(),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const paymentSettings=sqliteTable('mimipip_payment_settings',{
 id:text('id').primaryKey(),ciphertext:text('ciphertext').notNull(),iv:text('iv').notNull(),salt:text('salt').notNull(),ownerId:text('owner_id').notNull(),createdAt:integer('created_at').notNull(),
});
