"""Evaluación local de PDF con facturas ficticias y un control público."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
ARCA_URL = "https://www.afipts.com/packages/pdf/factura-a-demo.pdf"
ARCA_SHA256 = "a8c58188996860bea59b43fafff572dc5697445bcc62db59e5c387923e89f479"
PYAFIP_URL = ("https://www.sistemasagiles.com.ar/trac/raw-attachment/wiki/"
              "HerramientaFacturaElectronica/FacturaA0002-00000136.pdf")
PYAFIP_SHA256 = "e2de92ded3d0b926949385bbf5218bfb36c8423824290024b19131fc9b3797a8"


def esperado_factura(emisor, cuit, numero, fecha, total):
    return dict(tipo="factura", emisor=emisor, cuit=cuit, numero=numero, fecha=fecha, total=total)


def factura_a():
    return [
        "FACTURA A", "COD. 01", "Razón Social: Insumos El Ombú QA",
        "CUIT: 30-00001111-2", "Comp. Nro: 00012-00000035",
        "Fecha de Emisión: 11/11/2026",
        "Detalle                         Cantidad                 Precio",
        "Sales minerales                  2                        $ 48.250,00",
        "Importe Neto Gravado: $ 96.500,00", "IVA 21%: $ 20.265,00",
        "Importe Total: $ 116.765,00",
    ]


def escribir_pdf(ruta, paginas):
    doc = canvas.Canvas(str(ruta), pagesize=(595, 842), invariant=True)
    for lineas in paginas:
        for i, linea in enumerate(lineas):
            doc.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 17 if i == 0 else 11)
            doc.drawString(54, 778 - 22 * i, linea)
        doc.showPage()
    doc.save()


def obtener_publico(destino, origen, url, sha256):
    if origen:
        datos = origen.read_bytes()
    else:
        with urlopen(url, timeout=20) as respuesta:
            datos = respuesta.read(5_242_881)
    if hashlib.sha256(datos).hexdigest() != sha256:
        raise ValueError(f"Cambió {destino.name}. Verificar el original antes de usarlo.")
    destino.write_bytes(datos)
    return destino


def preparar_casos(carpeta, tesseract, arca_pdf, pyafip_pdf):
    casos = []

    def agregar(id_caso, esperado, paginas=None, grupo="evaluacion", origen=None):
        ruta = origen or carpeta / f"{id_caso}.pdf"
        if paginas is not None:
            escribir_pdf(ruta, paginas)
        casos.append(dict(id=id_caso, grupo=grupo, esperado=esperado,
                          variantes=[dict(metodo="pdf", archivo=str(ruta))]))
        return ruta

    a = factura_a()
    a_esperado = esperado_factura("Insumos El Ombú QA", "30000011112",
                                  "00012-00000035", "2026-11-11", 11676500)
    a_pdf = agregar("factura-a-insumos", a_esperado, [a])
    agregar("factura-b-transporte",
            esperado_factura("Fletes La Calandria QA", "30000022221",
                             "00003-00000806", "2026-10-27", 16590000),
            [["FACTURA B", "COD. 06", "Razón Social: Fletes La Calandria QA",
              "CUIT: 30-00002222-1", "Punto de Venta: 00003 Comp. Nro: 00000806",
              "Fecha de Emisión: 27/10/2026", "Traslado de hacienda",
              "Subtotal: $ 165.900,00", "Importe Total: $ 165.900,00"]])
    c_esperado = esperado_factura("Servicios El Caldén QA", "20000033337",
                                  "00004-00000492", "2026-10-29", 8740050)
    c_pdf = agregar("factura-c-monotributo", c_esperado,
                    [["FACTURA C", "COD. 011", "Razón Social: Servicios El Caldén QA",
                      "CUIT: 20-00003333-7", "Nro.: 00004-00000492", "Fecha: 29/10/2026",
                      "Honorarios veterinarios", "Importe Neto Gravado: $ 87.400,50",
                      "Importe Total: $ 87.400,50"]])
    agregar("factura-otro-sistema",
            esperado_factura("Agroveterinaria La Huella QA", "30000044445",
                             "00019-00000052", "2026-11-04", 20495000),
            [["FACTURA A", "CÓD. 001", "Razón Social: Agroveterinaria La Huella QA",
              "CUIT: 30-00004444-5", "Número de Comprobante: 00019-00000052",
              "Fecha del comprobante: 04/11/2026", "Subtotal neto: $ 169.380,17",
              "TOTAL A PAGAR: ARS 204.950,00"]])
    agregar("factura-copias", a_esperado, [[copia, *a] for copia in ("ORIGINAL", "DUPLICADO", "TRIPLICADO")],
            grupo="control")
    agregar("nota-de-credito", None,
            [["NOTA DE CRÉDITO A", "COD. 03", "Razón Social: Distribuidora Horizonte QA",
              "CUIT: 30-00005555-4", "Nro.: 00001-00000017", "Fecha: 30/10/2026",
              "FACTURA A", "Importe Neto Gravado: $ 9.000,00", "Importe Total: $ 10.890,00"]])
    agregar("remito", None,
            [["REMITO", "COD. 91", "Razón Social: Insumos Frontera QA",
              "CUIT: 30-00006666-3", "Nro.: 00001-00000014", "Fecha: 03/11/2026",
              "Entrega de insumos - 12 bolsas", "Factura a emitir"]])
    agregar("dos-facturas-en-un-pdf", None,
            [a, [linea.replace("00000035", "00000036") for linea in a]])
    agregar("totales-contradictorios",
            dict(tipo="totales_en_conflicto", totales=[11676500, 16876500]),
            [[*a, "Importe Total: $ 168.765,00"]])
    agregar("moneda-extranjera", None,
            [[*a[:7], "Moneda: USD", "Importe Neto Gravado: $ 1.000,00", "Importe Total: $ 1.210,00"]])
    agregar("parte-veterinario", dict(tipo="visita", fecha="2026-10-23", total=15200000,
                                     gestacion=42, sangrados=18, km=64),
            [["Resumen de cuenta", "28 de octubre de 2026",
              "23/10/26 Diagnósticos de gestación 42 2,00", "Sangrados 18 1,50",
              "Movilidad 640 64 $ 41.000,00", "TOTAL $ 152.000,00"]])
    agregar("constancia-laboratorio", dict(tipo="constancia", fecha="2026-10-30", protocolo="731845", cantidad=24),
            [["CONSTANCIA DE REGISTRO DE SEROLOGÍA", "Protocolo: 731.845",
              "Fecha carga: 30/10/2026", "Analizados: 24"]])

    arca = obtener_publico(carpeta / "arca-a.pdf", arca_pdf, ARCA_URL, ARCA_SHA256)
    agregar("arca-sdk-publico", esperado_factura("ESTUDIO CONTABLE DE PRUEBA", "30702345678",
                                                "00001-00000487", "2026-05-01", 71127500),
            grupo="control", origen=arca)
    pyafip = obtener_publico(carpeta / "pyafip.pdf", pyafip_pdf, PYAFIP_URL, PYAFIP_SHA256)
    agregar("pyafipws-nacional", esperado_factura("Empresa de Prueba", "20267565393",
                                                 "00002-00000136", "2010-07-14", 75705),
            origen=pyafip)

    for nombre, original, esperado, dpi in [
        ("escaneo-a-250dpi", a_pdf, a_esperado, 250),
        ("escaneo-c-125dpi", c_pdf, c_esperado, 125),
    ]:
        prefijo = carpeta / nombre
        subprocess.run(["pdftoppm", "-singlefile", "-r", str(dpi), "-png", str(original), str(prefijo)], check=True)
        escaneo = prefijo.with_suffix(".pdf")
        pdf = canvas.Canvas(str(escaneo), pagesize=(595, 842), invariant=True)
        pdf.drawImage(str(prefijo.with_suffix(".png")), 0, 0, width=595, height=842)
        pdf.save()
        agregar(nombre, esperado, origen=escaneo)
        if tesseract:
            salida = carpeta / f"{nombre}-ocr"
            subprocess.run([tesseract, str(prefijo.with_suffix(".png")), str(salida),
                            "-l", "spa", "--psm", "6", "pdf", "quiet"], check=True)
            casos[-1]["variantes"].append(dict(metodo="ocr", archivo=str(salida.with_suffix(".pdf"))))
    return casos


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--deno", default="deno")
    cli.add_argument("--tesseract", help="Ejecutable con el idioma spa instalado")
    cli.add_argument("--arca-pdf", type=Path, help="Copia local del PDF público de control")
    cli.add_argument("--pyafip-pdf", type=Path, help="Copia local del PDF público de homologación")
    args = cli.parse_args()
    with tempfile.TemporaryDirectory(prefix="troppero-evaluacion-pdf-") as temporal:
        carpeta = Path(temporal)
        casos = preparar_casos(carpeta, args.tesseract, args.arca_pdf, args.pyafip_pdf)
        manifiesto = carpeta / "casos.json"
        manifiesto.write_text(json.dumps(casos, ensure_ascii=False), encoding="utf-8")
        subprocess.run([args.deno, "run", "--no-config", "--no-lock",
                        f"--allow-read={carpeta}", str(HERE / "evaluar.ts"), str(manifiesto)],
                       check=True)


if __name__ == "__main__":
    main()
