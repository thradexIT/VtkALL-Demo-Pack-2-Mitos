import { Schema, Types, model } from 'mongoose'

export const PASSWORD_RESET_TOKEN_EXPIRE_AT_INDEX_NAME = 'passwordResetExpireAt'

export interface PasswordResetTokenDocument {
  user: Types.ObjectId
  tokenHash: string
  expireAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expireAt: {
      type: Date,
      required: true,
      index: {
        name: PASSWORD_RESET_TOKEN_EXPIRE_AT_INDEX_NAME,
        expireAfterSeconds: 0,
        background: true,
      },
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'PasswordResetToken',
  },
)

const PasswordResetToken = model<PasswordResetTokenDocument>('PasswordResetToken', passwordResetTokenSchema)

export default PasswordResetToken
