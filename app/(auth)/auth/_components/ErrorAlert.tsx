import React from 'react';
import { MdErrorOutline } from 'react-icons/md';
import styles from './ErrorAlert.module.css';

export type ErrorAlertProps = {
  message: string;
};

/**
 * Sticky error banner for the auth flow. It has no auto-dismiss timer: the
 * caller clears it the moment the user focuses a field, so the message stays
 * up until they act.
 */
export function ErrorAlert({ message }: ErrorAlertProps) {
  return (
    <div className={styles.errorAlert} role="alert">
      <MdErrorOutline
        className={styles.errorAlertIcon}
        size={18}
        aria-hidden="true"
      />
      <span className={styles.errorAlertText}>{message}</span>
    </div>
  );
}
