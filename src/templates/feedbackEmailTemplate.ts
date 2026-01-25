export interface FeedbackEmailData {
  rating: number;
  tool: string;
  feedback: string;
  email?: string;
}

export function generateFeedbackEmailTemplate(data: FeedbackEmailData): string {
  const filledStars = "★".repeat(data.rating);
  const emptyStars = "☆".repeat(5 - data.rating);
  const timestamp = new Date().toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true 
  });

  // Build stars HTML
  const starsHTML = filledStars.split('').map(star => 
    `<span style="color: #C53C38;">${star}</span>`
  ).join(' ') + ' ' + emptyStars.split('').map(star => 
    `<span class="rating-empty">${star}</span>`
  ).join(' ');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>New Feedback Received</title>
    <style>
        /* Reset and Base Styles */
        body, table, td, a { text-decoration: none !important; }
        body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #F8F9FA; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        table { border-collapse: collapse !important; }
        
        /* Layout */
        .wrapper { width: 100%; table-layout: fixed; background-color: #F8F9FA; padding-bottom: 40px; }
        .main-container { width: 100%; max-width: 600px; background-color: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 4px; margin: 40px auto; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        
        /* Components */
        .header { padding: 32px 40px 20px 40px; border-bottom: 1px solid #EEEEEE; }
        .content { padding: 32px 40px; }
        .footer { padding: 0 40px 40px 40px; font-size: 12px; color: #888888; text-align: left; }
        
        .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #666666; margin-bottom: 8px; display: block; }
        .rating-stars { font-size: 20px; letter-spacing: 2px; }
        .rating-empty { color: #E0E0E0; }
        
        .badge { background-color: #F4F4F4; border: 1px solid #EAEAEA; color: #444444; padding: 4px 10px; font-size: 13px; font-weight: 500; border-radius: 3px; display: inline-block; }
        
        .feedback-box { background-color: #FFFFFF; border-left: 3px solid #C53C38; padding: 16px 20px; margin: 20px 0; border-top: 1px solid #F0F0F0; border-right: 1px solid #F0F0F0; border-bottom: 1px solid #F0F0F0; }
        .feedback-text { color: #1A1A1A; font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
        
        .user-link { color: #C53C38; font-weight: 500; font-size: 14px; }
        
        /* Mobile adjustments */
        @media screen and (max-width: 600px) {
            .content, .header, .footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main-container" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td class="header">
                    <h1 style="margin: 0; font-size: 20px; color: #000000; font-weight: 700;">New Feedback Received</h1>
                </td>
            </tr>

            <tr>
                <td class="content">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                        <tr>
                            <td>
                                <span class="label">User Rating</span>
                                <div class="rating-stars">
                                    ${starsHTML}
                                    <span style="font-size: 14px; color: #666666; margin-left: 8px; font-weight: normal;">(${data.rating}/5)</span>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                        <tr>
                            <td>
                                <span class="label">Source Tool</span>
                                <div class="badge">${data.tool}</div>
                            </td>
                        </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td>
                                <span class="label">Comments</span>
                                <div class="feedback-box">
                                    <div class="feedback-text">${data.feedback}</div>
                                </div>
                            </td>
                        </tr>
                    </table>

                    ${data.email ? `
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
                        <tr>
                            <td>
                                <span class="label">Submitted By</span>
                                <a href="mailto:${data.email}" class="user-link">${data.email}</a>
                            </td>
                        </tr>
                    </table>
                    ` : ''}
                </td>
            </tr>

            <tr>
                <td class="footer">
                    <hr style="border: 0; border-top: 1px solid #EEEEEE; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px 0;">Submitted on ${timestamp}</p>
                    <p style="margin: 0;">This is an automated notification from VidSpire. Manage notification settings in your account profile.</p>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
  `;
}