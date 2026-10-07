import crypto from 'node:crypto'
import { Request, Response } from 'express'
import nodemailer from 'nodemailer'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '../lang/i18n'
import * as env from '../config/env.config'
import User from '../models/User'
import PasswordResetToken from '../models/PasswordResetToken'
import * as helper from '../utils/helper'
import * as authHelper from '../utils/authHelper'
import * as mailHelper from '../utils/mailHelper'
import * as logger from '../utils/logger'

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

const getAppType = (value: string) => value.toLowerCase() as bookcarsTypes.AppType

const userMatchesApp = (user: env.User, type: bookcarsTypes.AppType) => (
  [bookcarsTypes.AppType.Frontend, bookcarsTypes.AppType.Admin].includes(type)
  && !(
    (type === bookcarsTypes.AppType.Admin && user.type === bookcarsTypes.UserType.User)
    || (type === bookcarsTypes.AppType.Frontend && user.type !== bookcarsTypes.UserType.User)
  )
)

const getResetHost = (req: Request, user: env.User) => (
  user.type === bookcarsTypes.UserType.User
    ? helper.getFrontendHost(req)
    : helper.getAdminHost(req)
)

/**
 * Request a password reset without disabling or otherwise mutating the user.
 * The response is deliberately generic so callers cannot enumerate accounts.
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  const email = helper.trim(String(req.body?.email || ''), ' ')
  const type = getAppType(req.params.type)

  if (!helper.isValidEmail(email)) {
    res.status(400).send('Invalid email')
    return
  }

  try {
    const user = await User.findOne({ email })

    // Do not expose whether the account exists or belongs to this application.
    if (!user || !userMatchesApp(user, type)) {
      res.sendStatus(200)
      return
    }

    const rawToken = helper.generateToken()
    const tokenHash = hashToken(rawToken)
    const expireAt = new Date(Date.now() + env.TOKEN_EXPIRE_AT * 1000)

    // A new request invalidates older reset links for this account.
    await PasswordResetToken.deleteMany({ user: user._id })
    await PasswordResetToken.create({
      user: user._id,
      tokenHash,
      expireAt,
    })

    i18n.locale = user.language
    const resetLink = `${helper.joinURL(getResetHost(req, user), 'reset-password')}/?u=${encodeURIComponent(user._id.toString())}&e=${encodeURIComponent(user.email)}&t=${encodeURIComponent(rawToken)}`

    const mailOptions: nodemailer.SendMailOptions = {
      from: env.SMTP_FROM,
      to: user.email,
      subject: i18n.t('PASSWORD_RESET_SUBJECT'),
      html:
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <p style="font-size: 16px; color: #555;">
            ${i18n.t('HELLO')} ${user.fullName},<br><br>
            ${i18n.t('PASSWORD_RESET_LINK')}<br><br>
            <a href="${resetLink}" target="_blank" rel="noopener noreferrer">${resetLink}</a><br><br>
            ${i18n.t('REGARDS')}<br>
          </p>
        </div>`,
    }

    await mailHelper.sendMail(mailOptions)
    res.sendStatus(200)
  } catch (err) {
    logger.error(`[passwordReset.request] ${i18n.t('DB_ERROR')} ${email}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Validate a reset link. The raw token is never stored in the database.
 */
export const validatePasswordReset = async (req: Request, res: Response) => {
  const { userId, email, token } = req.params
  const type = getAppType(req.params.type)

  try {
    if (!helper.isValidObjectId(userId) || !helper.isValidEmail(email) || !token) {
      res.sendStatus(204)
      return
    }

    const user = await User.findOne({ _id: userId, email })
    if (!user || !userMatchesApp(user, type)) {
      res.sendStatus(204)
      return
    }

    const resetToken = await PasswordResetToken.findOne({
      user: user._id,
      tokenHash: hashToken(token),
      expireAt: { $gt: new Date() },
    })

    res.sendStatus(resetToken ? 200 : 204)
  } catch (err) {
    logger.error(`[passwordReset.validate] ${i18n.t('DB_ERROR')} ${userId}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Consume a valid reset token once and update the password.
 */
export const resetPassword = async (req: Request, res: Response) => {
  const { userId, email, token, password } = req.body || {}
  const type = getAppType(req.params.type)

  try {
    if (
      !helper.isValidObjectId(userId)
      || !helper.isValidEmail(email)
      || typeof token !== 'string'
      || !token
      || typeof password !== 'string'
      || !password
    ) {
      res.status(400).send('Invalid password reset payload')
      return
    }

    const user = await User.findOne({ _id: userId, email })
    if (!user || !userMatchesApp(user, type)) {
      res.sendStatus(204)
      return
    }

    const resetToken = await PasswordResetToken.findOne({
      user: user._id,
      tokenHash: hashToken(token),
      expireAt: { $gt: new Date() },
    })

    if (!resetToken) {
      res.sendStatus(204)
      return
    }

    user.password = await authHelper.hashPassword(password)
    await user.save()

    // Consume this and every older reset token for the account.
    await PasswordResetToken.deleteMany({ user: user._id })

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[passwordReset.complete] ${i18n.t('DB_ERROR')} ${userId || ''}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
