import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'
import env from '@/config/env.config'

const strings = new LocalizedStrings({
  fr: {
    CONGRATULATIONS: 'Félicitation!',
    SUCCESS: 'Votre paiement a été effectué avec succès. Votre réservation est confirmée.',
    SUCCESS_DEPOSIT: 'Votre paiement de réservation a été approuvé. Votre réservation est garantie.',
    SUCCESS_PAY_LATER: 'Votre réservation a été effectuée avec succès.',
    ERROR: 'Une erreur est survenue. Veuillez réessayer plus tard.',
    STATUS_TITLE: `${env.WEBSITE_NAME} Confirmation de réservation`,
    STATUS_MESSAGE: 'Votre réservation est enregistrée. Vous pouvez consulter ses détails dans vos réservations.',
    STATUS_MESSAGE_DEPOSIT: 'Votre réservation est garantie. Le solde restant est dû lors du retrait du véhicule.',
    PAID_NOW: 'Payé maintenant',
    BALANCE_DUE: 'Solde restant',
  },
  en: {
    CONGRATULATIONS: 'Congratulations!',
    SUCCESS: 'Your payment was completed successfully. Your booking is confirmed.',
    SUCCESS_DEPOSIT: 'Your reservation payment was approved. Your booking is secured.',
    SUCCESS_PAY_LATER: 'Your booking was completed successfully.',
    ERROR: 'Something went wrong. Please try again later.',
    STATUS_TITLE: `${env.WEBSITE_NAME} Booking Confirmation`,
    STATUS_MESSAGE: 'Your booking has been recorded. You can review its details in My Bookings.',
    STATUS_MESSAGE_DEPOSIT: 'Your booking is secured. The remaining balance is due when you collect the vehicle.',
    PAID_NOW: 'Paid now',
    BALANCE_DUE: 'Balance due',
  },
  es: {
    CONGRATULATIONS: '¡Felicitaciones!',
    SUCCESS: 'Tu pago se realizó con éxito. Tu reserva está confirmada.',
    SUCCESS_DEPOSIT: 'Tu pago de reserva fue aprobado. Tu reserva está asegurada.',
    SUCCESS_PAY_LATER: 'Tu reserva se ha realizado con éxito.',
    ERROR: 'Algo salió mal. Inténtelo nuevamente más tarde.',
    STATUS_TITLE: `${env.WEBSITE_NAME} Confirmación de reserva`,
    STATUS_MESSAGE: 'Tu reserva ha quedado registrada. Puedes consultar sus detalles en Mis reservas.',
    STATUS_MESSAGE_DEPOSIT: 'Tu reserva está asegurada. El saldo restante se paga al recoger el vehículo.',
    PAID_NOW: 'Pagado ahora',
    BALANCE_DUE: 'Saldo pendiente',
  },
})

langHelper.setLanguage(strings)
export { strings }
