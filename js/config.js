// =============================================
// CONFIGURAÇÃO — Substitua pelos dados do Supabase
// =============================================
const SUPABASE_URL = 'https://bdctrgpgkdieowlvnnny.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkY3RyZ3Bna2RpZW93bHZubm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzkxNTEsImV4cCI6MjA5MTA1NTE1MX0.U9DXnnRq92AiNIzha0VIjHkU38pQeXLY1SLfh4PYoKw';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Configurações da rifa
const RIFA_CONFIG = {
    totalNumeros: 100,
    valorPorNumero: 10.00,
    maxPorCompra: 10,
    pixChave: '+5512983001971',
    pixNome: 'BRUNA RAFAELE G COSTA',
    pixCidade: 'SAO JOSE CAMPOS',
    whatsappNumero: '5512983001971',
    premio: '1 Barril Heineken 5L + 1 Peça de Picanha (ou R$ 200,00 no PIX)'
};

// Credenciais do admin (hash SHA-256 de "usuario:senha")
// Usuário: bruna.adm | Senha: H3in3k@Rifa!2026
const ADMIN_HASH = '463df236e4d5e860805eb21ae0700697d2b393e392a446d164cffcd4347dd493';

// Gerar hash SHA-256 via Web Crypto API
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Escapar HTML (prevenir XSS)
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
