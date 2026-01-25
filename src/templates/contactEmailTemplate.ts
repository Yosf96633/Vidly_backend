interface ContactEmailProps {
  name: string;
  email: string;
  message: string;
}

export const generateContactEmailTemplate = ({
  name,
  email,
  message,
}: ContactEmailProps): string => {
  const brandColor = '#1f2937'; // Dark Slate Grey
  const accentColor = '#D6211E'; // Reusing your original crimson as an accent
  
  const formattedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>New Contact Form Submission</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f7f7f9; color: ${brandColor}; }

    /* Button hover */
    .button-primary { background-color: ${accentColor}; }
    .button-primary:hover { background-color: #a01915 !important; }
    
    /* Mobile Styles */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 20px !important; }
      .header-padding { padding: 30px 20px 20px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f9;">

  <div style="display: none; max-height: 0px; overflow: hidden;">
    New Inquiry from ${name}. Click to view details.
  </div>

  <center style="width: 100%; background-color: #f7f7f9; padding: 50px 0;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); overflow: hidden;">
      
      <tr>
        <td class="header-padding" style="padding: 40px 40px 30px 40px; text-align: left; border-bottom: 2px solid #eeeeee;">
          <img src="${baseUrl}/logo.png" alt="Company Logo" style="height: 35px; width: auto; margin-bottom: 15px; display: block;" />
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: ${brandColor};">Contact Form Submission</h1>
          <p style="margin: 8px 0 0; font-size: 15px; color: #6b7280;">A new inquiry has arrived and requires your attention.</p>
        </td>
      </tr>

      <tr>
        <td class="content-padding" style="padding: 40px;">

          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 30px;">
            <tr>
              <td style="background-color: #f8fafc; border: 1px solid #e5e7eb; border-left: 5px solid ${accentColor}; border-radius: 6px; padding: 25px;">
                <h3 style="margin: 0 0 15px; font-size: 18px; font-weight: 600; color: ${brandColor};">Sender Details</h3>
                
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding: 8px 0; width: 80px; font-size: 14px; color: #6b7280; font-weight: 500; vertical-align: top;">Name:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: ${brandColor}; font-weight: 600;">${name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; width: 80px; font-size: 14px; color: #6b7280; font-weight: 500; vertical-align: top;">Email:</td>
                    <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">
                      <a href="mailto:${email}" style="color: ${accentColor}; text-decoration: none;">${email}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <h3 style="margin: 0 0 15px; font-size: 18px; font-weight: 600; color: ${brandColor};">Message Content</h3>
          <div style="background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; font-size: 15px; line-height: 1.6; color: ${brandColor};">
            ${formattedMessage}
          </div>

          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-top: 30px;">
            <tr>
              <td align="left">
                <a href="mailto:${email}?subject=Re: Your Contact Form Submission" class="button-primary" style="display: inline-block; padding: 14px 30px; background-color: ${accentColor}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; mso-padding-alt: 0; text-align: center;">
                  <span style="mso-text-raise: 13pt;">Reply to ${name}</span>
                  </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td align="center" style="padding: 30px 40px; background-color: #f7f7f9; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">
            Notification sent via your website.
          </p>
          <p style="margin: 0; color: #d1d5db; font-size: 12px;">
            &copy; ${currentYear} Your Company Name.
          </p>
        </td>
      </tr>

    </table>
  </center>
</body>
</html>
  `.trim();
};