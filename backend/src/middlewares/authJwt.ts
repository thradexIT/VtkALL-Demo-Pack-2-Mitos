import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import * as helper from '../utils/helper'
import * as authHelper from '../utils/authHelper'
import * as logger from '../utils/logger'
import User from '../models/User'

/**
 * Verify authentication token middleware.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 */
const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  let token: string
  const isAdmin = authHelper.isAdmin(req)
  const isFrontend = authHelper.isFrontend(req)

  if (isAdmin) {
    token = req.signedCookies[env.ADMIN_AUTH_COOKIE_NAME] as string // admin
  } else if (isFrontend) {
    token =
      (req.signedCookies[env.FRONTEND_AUTH_COOKIE_NAME] as string) ||
      (req.headers[env.X_ACCESS_TOKEN] as string) // frontend
  } else {
    token =
      (req.headers[env.X_ACCESS_TOKEN] as string) ||
      (req.signedCookies[env.FRONTEND_AUTH_COOKIE_NAME] as string) // mobile app and unit tests
  }

  if (token) {
    // Check token
    try {
      const sessionData = await authHelper.decryptJWT(token)
      const $match: mongoose.QueryFilter<env.User> = {
        $and: [
          { _id: new mongoose.Types.ObjectId(sessionData?.id) },
          // { blacklisted: false },
        ],
      }

      if (isAdmin) {
        $match.$and?.push({ type: { $in: [bookcarsTypes.UserType.Admin, bookcarsTypes.UserType.Supplier] } })
      } else if (isFrontend) {
        $match.$and?.push({ type: bookcarsTypes.UserType.User })
      }

      if (
        !sessionData
        || !helper.isValidObjectId(sessionData.id)
        || !(await User.exists($match))
      ) {
        // Token not valid!
        logger.info('Token not valid: User not found')
        res.status(401).send({ message: 'Unauthorized!' })
      } else {
        // Token valid!
        next()
      }
    } catch (err) {
      // Token not valid!
      logger.info('Token not valid', err)
      res.status(401).send({ message: 'Unauthorized!' })
    }
  } else {
    // Token not found!
    res.status(403).send({ message: 'No token provided!' })
  }
}

/**
 * Verify that the caller is an authenticated backoffice identity regardless of
 * whether the request comes from the Admin browser surface or a trusted mobile /
 * test client. Payment reconciliation changes reservation/payment state and
 * therefore must never be available to an ordinary customer token.
 */
const verifyBackofficeToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = (
    (req.signedCookies?.[env.ADMIN_AUTH_COOKIE_NAME] as string)
    || (req.headers[env.X_ACCESS_TOKEN] as string)
    || (req.signedCookies?.[env.FRONTEND_AUTH_COOKIE_NAME] as string)
  )

  if (!token) {
    res.status(403).send({ message: 'No token provided!' })
    return
  }

  try {
    const sessionData = await authHelper.decryptJWT(token)
    if (!sessionData || !helper.isValidObjectId(sessionData.id)) {
      res.status(401).send({ message: 'Unauthorized!' })
      return
    }

    const backofficeUser = await User.exists({
      _id: new mongoose.Types.ObjectId(sessionData.id),
      type: { $in: [bookcarsTypes.UserType.Admin, bookcarsTypes.UserType.Supplier] },
    })

    if (!backofficeUser) {
      logger.info('Backoffice token rejected: user role is not Admin/Supplier')
      res.status(403).send({ message: 'Forbidden!' })
      return
    }

    next()
  } catch (err) {
    logger.info('Backoffice token not valid', err)
    res.status(401).send({ message: 'Unauthorized!' })
  }
}

export default { verifyToken, verifyBackofficeToken }
