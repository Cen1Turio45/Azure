import json
import logging
import os
from datetime import datetime, timezone

import azure.functions as func
from azure.communication.email import EmailClient
from azure.storage.blob import BlobClient

app = func.FunctionApp()

PROJECT_NAME = os.getenv("PROJECT_NAME", "Projekt 2 - Automatisiertes Backup")
STATUS_CONTAINER_NAME = os.getenv("STATUS_CONTAINER_NAME", "status")
CURRENT_STATUS_BLOB_NAME = os.getenv("CURRENT_STATUS_BLOB_NAME", "backup-status.json")
WARNING_THRESHOLD_HOURS = int(os.getenv("WARNING_THRESHOLD_HOURS", "72"))


def _parse_status_payload(payload: str) -> dict:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Status file is not valid JSON: {exc}") from exc

    return {
        "projectName": data.get("projectName", PROJECT_NAME),
        "timestamp": data.get("timestamp", ""),
        "status": data.get("status", "failed"),
        "processedFileCount": data.get("processedFileCount", 0),
        "errorMessage": data.get("errorMessage", ""),
        "retryCount": data.get("retryCount", 0),
        "lastError": data.get("lastError", ""),
    }


def _parse_timestamp(timestamp: str) -> datetime:
    if not timestamp:
        raise ValueError("Status timestamp is missing.")

    normalized = timestamp.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _send_email(subject: str, body: str) -> None:
    connection_string = os.environ["COMMUNICATION_SERVICES_CONNECTION_STRING"]
    sender_address = os.environ["ACS_EMAIL_SENDER"]
    recipient_address = os.environ["MAIL_TO"]

    client = EmailClient.from_connection_string(connection_string)
    message = {
        "senderAddress": sender_address,
        "recipients": {
            "to": [
                {
                    "address": recipient_address,
                }
            ]
        },
        "content": {
            "subject": subject,
            "plainText": body,
        },
    }

    poller = client.begin_send(message)
    poller.result()


def _format_status_email(status_data: dict) -> tuple[str, str]:
    status = status_data["status"]
    project_name = status_data["projectName"]
    processed_count = status_data["processedFileCount"]
    timestamp = status_data["timestamp"]
    error_message = status_data["errorMessage"] or "Keine Fehlermeldung vorhanden."
    retry_count = status_data["retryCount"]
    last_error = status_data["lastError"] or "Keine Fehlerhistorie vorhanden."

    subject = f"[{project_name}] Backup {status}"
    body = "\n".join(
        [
            f"Projekt: {project_name}",
            f"Status: {status}",
            f"Zeitpunkt: {timestamp}",
            f"Erfolgreich verarbeitete Dateien: {processed_count}",
            f"Retry-Anzahl: {retry_count}",
            f"Fehlermeldung: {error_message}",
            f"Letzter Fehler: {last_error}",
        ]
    )

    return subject, body


def _build_warning_from_current_status(force_warning: bool = False) -> tuple[bool, str]:
    connection_string = os.environ["BackupStorageConnection"]
    blob_client = BlobClient.from_connection_string(
        conn_str=connection_string,
        container_name=STATUS_CONTAINER_NAME,
        blob_name=CURRENT_STATUS_BLOB_NAME,
    )

    payload = blob_client.download_blob().readall().decode("utf-8-sig")
    status_data = _parse_status_payload(payload)
    last_backup_time = _parse_timestamp(status_data["timestamp"])
    now = datetime.now(timezone.utc)
    hours_since_last_run = (now - last_backup_time).total_seconds() / 3600

    if hours_since_last_run < WARNING_THRESHOLD_HOURS and not force_warning:
        return (
            False,
            f"Last backup is {hours_since_last_run:.2f} hours old. No warning needed.",
        )

    warning_data = {
        "projectName": status_data["projectName"],
        "timestamp": now.isoformat(),
        "status": "warning",
        "processedFileCount": status_data["processedFileCount"],
        "errorMessage": f"Achtung: {int(hours_since_last_run)} Stunden kein Backup-Lauf.",
        "retryCount": status_data["retryCount"],
        "lastError": status_data["lastError"],
    }

    subject, body = _format_status_email(warning_data)
    _send_email(subject, body)
    return True, f"Warning email sent after {hours_since_last_run:.2f} hours."


@app.route(route="send-test-email", auth_level=func.AuthLevel.FUNCTION)
def send_test_email(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Manual test email endpoint called.")

    try:
        now = datetime.now(timezone.utc).isoformat()
        subject = f"[{PROJECT_NAME}] Test email"
        body = "\n".join(
            [
                f"Projekt: {PROJECT_NAME}",
                "Status: test",
                f"Zeitpunkt: {now}",
                "Nachricht: Azure Function und Azure Communication Services wurden manuell getestet.",
            ]
        )

        _send_email(subject, body)
        return func.HttpResponse(
            "Test email sent successfully.",
            status_code=200,
        )
    except Exception as exc:
        logging.exception("Could not send test email.")
        return func.HttpResponse(
            f"Could not send test email: {exc}",
            status_code=500,
        )


@app.route(route="check-warning", auth_level=func.AuthLevel.FUNCTION)
def check_warning(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Manual warning check endpoint called.")

    force_warning = req.params.get("force", "").lower() == "true"

    try:
      warning_sent, message = _build_warning_from_current_status(force_warning)
      status_code = 200 if warning_sent else 204
      return func.HttpResponse(message, status_code=status_code)
    except Exception as exc:
      logging.exception("Could not run warning check.")
      return func.HttpResponse(
          f"Could not run warning check: {exc}",
          status_code=500,
      )


@app.blob_trigger(
    arg_name="status_blob",
    path="status/backup-status.json",
    connection="BackupStorageConnection",
)
def backup_status_blob_trigger(status_blob: func.InputStream) -> None:
    logging.info("Blob trigger received backup status update: %s", status_blob.name)

    payload = status_blob.read().decode("utf-8-sig")
    status_data = _parse_status_payload(payload)
    subject, body = _format_status_email(status_data)

    _send_email(subject, body)
    logging.info("Backup status email sent for status '%s'.", status_data["status"])


@app.timer_trigger(
    schedule="0 0 8 * * *",
    arg_name="timer",
    run_on_startup=False,
    use_monitor=True,
)
def backup_warning_timer_trigger(timer: func.TimerRequest) -> None:
    logging.info("Timer trigger checking last backup status timestamp.")

    warning_sent, message = _build_warning_from_current_status()
    if warning_sent:
        logging.warning(message)
    else:
        logging.info(message)
