// =============================================
// Gerador de PIX EMV (padrão Banco Central)
// Gera o código "Copia e Cola" com valor embutido
// =============================================

function crc16CCITT(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTLV(id, value) {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
}

function generatePixPayload(chave, nome, cidade, valor, txid) {
    const gui = formatTLV('00', 'br.gov.bcb.pix');
    const pixKey = formatTLV('01', chave);
    const merchantAccount = formatTLV('26', gui + pixKey);

    let payload = '';
    payload += formatTLV('00', '01');              // Payload Format Indicator
    payload += formatTLV('01', '12');              // Point of Initiation (dynamic)
    payload += merchantAccount;                     // Merchant Account (PIX)
    payload += formatTLV('52', '0000');            // Merchant Category Code
    payload += formatTLV('53', '986');             // Currency (BRL)
    payload += formatTLV('54', valor.toFixed(2));  // Transaction Amount
    payload += formatTLV('58', 'BR');              // Country Code
    payload += formatTLV('59', nome.substring(0, 25));   // Merchant Name
    payload += formatTLV('60', cidade.substring(0, 15)); // Merchant City

    if (txid) {
        const additional = formatTLV('05', txid);
        payload += formatTLV('62', additional);
    }

    // CRC16 — adiciona placeholder e calcula
    payload += '6304';
    const crc = crc16CCITT(payload);
    payload += crc;

    return payload;
}

function generateQRCode(elementId, payload) {
    const el = document.getElementById(elementId);
    el.innerHTML = '';
    new QRCode(el, {
        text: payload,
        width: 220,
        height: 220,
        colorDark: '#004225',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
}
