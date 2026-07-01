// ⚠️ GENERADO — no editar a mano.
// Regenerar tras cada migración: mcp Supabase generate_typescript_types →
// pegar acá → commitear junto a la migración. (Lección 2026-04-orka-supabase-tipos-post-migracion)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      animal: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_animal"]
          created_at: string
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_animal"]
          fecha_nacimiento: string | null
          id: string
          lote_id: string | null
          notas: string | null
          origen: string | null
          pelaje: string | null
          potrero_id: string | null
          raza: string | null
          sexo: Database["public"]["Enums"]["sexo_animal"] | null
          updated_at: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_animal"]
          created_at?: string
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_animal"]
          fecha_nacimiento?: string | null
          id?: string
          lote_id?: string | null
          notas?: string | null
          origen?: string | null
          pelaje?: string | null
          potrero_id?: string | null
          raza?: string | null
          sexo?: Database["public"]["Enums"]["sexo_animal"] | null
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_animal"]
          created_at?: string
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_animal"]
          fecha_nacimiento?: string | null
          id?: string
          lote_id?: string | null
          notas?: string | null
          origen?: string | null
          pelaje?: string | null
          potrero_id?: string | null
          raza?: string | null
          sexo?: Database["public"]["Enums"]["sexo_animal"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "animal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      campo: {
        Row: {
          contorno: Json | null
          created_at: string
          empresa_id: string
          hectareas: number | null
          id: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_campo"]
        }
        Insert: {
          contorno?: Json | null
          created_at?: string
          empresa_id: string
          hectareas?: number | null
          id?: string
          nombre: string
          tipo?: Database["public"]["Enums"]["tipo_campo"]
        }
        Update: {
          contorno?: Json | null
          created_at?: string
          empresa_id?: string
          hectareas?: number | null
          id?: string
          nombre?: string
          tipo?: Database["public"]["Enums"]["tipo_campo"]
        }
        Relationships: [
          {
            foreignKeyName: "campo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      caravana: {
        Row: {
          animal_id: string
          created_at: string
          empresa_id: string
          fecha_alta: string
          fecha_baja: string | null
          id: string
          motivo_baja: string | null
          numero_rfid: string
          numero_visual: string | null
          vigente: boolean
        }
        Insert: {
          animal_id: string
          created_at?: string
          empresa_id: string
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          motivo_baja?: string | null
          numero_rfid: string
          numero_visual?: string | null
          vigente?: boolean
        }
        Update: {
          animal_id?: string
          created_at?: string
          empresa_id?: string
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          motivo_baja?: string | null
          numero_rfid?: string
          numero_visual?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "caravana_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caravana_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_animal_con_caravana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caravana_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_movimiento: {
        Row: {
          activo: boolean
          aplica_a: Database["public"]["Enums"]["tipo_movimiento"] | null
          empresa_id: string | null
          grupo: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          aplica_a?: Database["public"]["Enums"]["tipo_movimiento"] | null
          empresa_id?: string | null
          grupo: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          aplica_a?: Database["public"]["Enums"]["tipo_movimiento"] | null
          empresa_id?: string | null
          grupo?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_movimiento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizacion_gordo: {
        Row: {
          created_at: string
          created_by: string | null
          empresa_id: string
          fecha: string
          id: string
          nota: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa_id: string
          fecha?: string
          id?: string
          nota?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
          nota?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_gordo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa: {
        Row: {
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      establecimiento: {
        Row: {
          campo_id: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          renspa: string | null
        }
        Insert: {
          campo_id: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          renspa?: string | null
        }
        Update: {
          campo_id?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          renspa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establecimiento_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establecimiento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      evento: {
        Row: {
          animal_id: string
          created_at: string
          created_by: string | null
          datos: Json
          empresa_id: string
          fecha: string
          id: string
          nota: string | null
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Insert: {
          animal_id: string
          created_at?: string
          created_by?: string | null
          datos?: Json
          empresa_id: string
          fecha?: string
          id?: string
          nota?: string | null
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Update: {
          animal_id?: string
          created_at?: string
          created_by?: string | null
          datos?: Json
          empresa_id?: string
          fecha?: string
          id?: string
          nota?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento"]
        }
        Relationships: [
          {
            foreignKeyName: "evento_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_animal_con_caravana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      infraestructura: {
        Row: {
          angulo_deg: number | null
          campo_id: string
          created_at: string
          empresa_id: string
          escala: number | null
          id: string
          lat: number
          lng: number
          radio_m: number | null
          tipo: Database["public"]["Enums"]["tipo_infraestructura"]
        }
        Insert: {
          angulo_deg?: number | null
          campo_id: string
          created_at?: string
          empresa_id: string
          escala?: number | null
          id?: string
          lat: number
          lng: number
          radio_m?: number | null
          tipo: Database["public"]["Enums"]["tipo_infraestructura"]
        }
        Update: {
          angulo_deg?: number | null
          campo_id?: string
          created_at?: string
          empresa_id?: string
          escala?: number | null
          id?: string
          lat?: number
          lng?: number
          radio_m?: number | null
          tipo?: Database["public"]["Enums"]["tipo_infraestructura"]
        }
        Relationships: [
          {
            foreignKeyName: "infraestructura_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infraestructura_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      lluvia: {
        Row: {
          campo_id: string
          created_at: string
          empresa_id: string
          fecha: string
          fuente: Database["public"]["Enums"]["fuente_lluvia"]
          id: string
          mm: number
        }
        Insert: {
          campo_id: string
          created_at?: string
          empresa_id: string
          fecha: string
          fuente?: Database["public"]["Enums"]["fuente_lluvia"]
          id?: string
          mm: number
        }
        Update: {
          campo_id?: string
          created_at?: string
          empresa_id?: string
          fecha?: string
          fuente?: Database["public"]["Enums"]["fuente_lluvia"]
          id?: string
          mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "lluvia_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lluvia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      lote: {
        Row: {
          created_at: string
          empresa_id: string
          especie: string | null
          id: string
          nombre: string
          potrero_id: string | null
          proposito: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          especie?: string | null
          id?: string
          nombre: string
          potrero_id?: string | null
          proposito?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          especie?: string | null
          id?: string
          nombre?: string
          potrero_id?: string | null
          proposito?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      miembro_empresa: {
        Row: {
          created_at: string
          empresa_id: string
          rol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          rol?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          rol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembro_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_financiero: {
        Row: {
          actividad: Database["public"]["Enums"]["actividad_movimiento"] | null
          animal_id: string | null
          campo_id: string
          categoria_id: string
          cheque_banco: string | null
          cheque_numero: string | null
          comprobante_url: string | null
          contraparte: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          empresa_id: string
          es_echeq: boolean
          estado: Database["public"]["Enums"]["estado_movimiento"]
          fecha_cobro_pago: string | null
          fecha_devengo: string
          fecha_vencimiento: string | null
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          moneda: string
          monto: number
          potrero_id: string | null
          serie_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          actividad?: Database["public"]["Enums"]["actividad_movimiento"] | null
          animal_id?: string | null
          campo_id: string
          categoria_id: string
          cheque_banco?: string | null
          cheque_numero?: string | null
          comprobante_url?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id: string
          es_echeq?: boolean
          estado?: Database["public"]["Enums"]["estado_movimiento"]
          fecha_cobro_pago?: string | null
          fecha_devengo: string
          fecha_vencimiento?: string | null
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          moneda?: string
          monto: number
          potrero_id?: string | null
          serie_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          actividad?: Database["public"]["Enums"]["actividad_movimiento"] | null
          animal_id?: string | null
          campo_id?: string
          categoria_id?: string
          cheque_banco?: string | null
          cheque_numero?: string | null
          comprobante_url?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id?: string
          es_echeq?: boolean
          estado?: Database["public"]["Enums"]["estado_movimiento"]
          fecha_cobro_pago?: string | null
          fecha_devengo?: string
          fecha_vencimiento?: string | null
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          moneda?: string
          monto?: number
          potrero_id?: string | null
          serie_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          tipo_cambio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_financiero_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_animal_con_caravana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria_movimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      observacion_potrero: {
        Row: {
          agua: Database["public"]["Enums"]["agua_estado"] | null
          conteo: number | null
          created_at: string
          electrico: Database["public"]["Enums"]["electrico_estado"] | null
          empresa_id: string
          en_tratamiento: boolean
          id: string
          novedad: string | null
          pasto: Database["public"]["Enums"]["pasto_estado"] | null
          potrero_id: string
          recorrida_id: string
        }
        Insert: {
          agua?: Database["public"]["Enums"]["agua_estado"] | null
          conteo?: number | null
          created_at?: string
          electrico?: Database["public"]["Enums"]["electrico_estado"] | null
          empresa_id: string
          en_tratamiento?: boolean
          id?: string
          novedad?: string | null
          pasto?: Database["public"]["Enums"]["pasto_estado"] | null
          potrero_id: string
          recorrida_id: string
        }
        Update: {
          agua?: Database["public"]["Enums"]["agua_estado"] | null
          conteo?: number | null
          created_at?: string
          electrico?: Database["public"]["Enums"]["electrico_estado"] | null
          empresa_id?: string
          en_tratamiento?: boolean
          id?: string
          novedad?: string | null
          pasto?: Database["public"]["Enums"]["pasto_estado"] | null
          potrero_id?: string
          recorrida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observacion_potrero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacion_potrero_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacion_potrero_recorrida_id_fkey"
            columns: ["recorrida_id"]
            isOneToOne: false
            referencedRelation: "recorrida"
            referencedColumns: ["id"]
          },
        ]
      }
      potrero: {
        Row: {
          aprovechamiento:
            | Database["public"]["Enums"]["aprovechamiento_forraje"]
            | null
          campo_id: string
          created_at: string
          cultivo: string | null
          destino: Database["public"]["Enums"]["destino_campania"] | null
          empresa_id: string
          establecimiento_id: string | null
          estado_ciclo: Database["public"]["Enums"]["estado_ciclo_potrero"]
          fecha_cosecha_estimada: string | null
          fecha_siembra: string | null
          hectareas: number | null
          id: string
          nombre: string
          poligono: Json | null
          variedad: string | null
        }
        Insert: {
          aprovechamiento?:
            | Database["public"]["Enums"]["aprovechamiento_forraje"]
            | null
          campo_id: string
          created_at?: string
          cultivo?: string | null
          destino?: Database["public"]["Enums"]["destino_campania"] | null
          empresa_id: string
          establecimiento_id?: string | null
          estado_ciclo?: Database["public"]["Enums"]["estado_ciclo_potrero"]
          fecha_cosecha_estimada?: string | null
          fecha_siembra?: string | null
          hectareas?: number | null
          id?: string
          nombre: string
          poligono?: Json | null
          variedad?: string | null
        }
        Update: {
          aprovechamiento?:
            | Database["public"]["Enums"]["aprovechamiento_forraje"]
            | null
          campo_id?: string
          created_at?: string
          cultivo?: string | null
          destino?: Database["public"]["Enums"]["destino_campania"] | null
          empresa_id?: string
          establecimiento_id?: string | null
          estado_ciclo?: Database["public"]["Enums"]["estado_ciclo_potrero"]
          fecha_cosecha_estimada?: string | null
          fecha_siembra?: string | null
          hectareas?: number | null
          id?: string
          nombre?: string
          poligono?: Json | null
          variedad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "potrero_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potrero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potrero_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimiento"
            referencedColumns: ["id"]
          },
        ]
      }
      recorrida: {
        Row: {
          campo_id: string
          created_at: string
          created_by: string | null
          empresa_id: string
          fecha: string
          id: string
        }
        Insert: {
          campo_id: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          fecha?: string
          id?: string
        }
        Update: {
          campo_id?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recorrida_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrida_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_animal_con_caravana: {
        Row: {
          caravana_rfid: string | null
          caravana_visual: string | null
          categoria: Database["public"]["Enums"]["categoria_animal"] | null
          created_at: string | null
          empresa_id: string | null
          estado: Database["public"]["Enums"]["estado_animal"] | null
          fecha_nacimiento: string | null
          id: string | null
          notas: string | null
          origen: string | null
          potrero_id: string | null
          sexo: Database["public"]["Enums"]["sexo_animal"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      v_flujo_caja: {
        Row: {
          campo_id: string | null
          cobrado: number | null
          empresa_id: string | null
          mes: string | null
          neto: number | null
          pagado: number | null
          potrero_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_financiero_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pendientes: {
        Row: {
          campo_id: string | null
          descripcion: string | null
          dias_para_vencer: number | null
          empresa_id: string | null
          fecha_vencimiento: string | null
          id: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          monto: number | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"] | null
        }
        Insert: {
          campo_id?: string | null
          descripcion?: string | null
          dias_para_vencer?: never
          empresa_id?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto?: number | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"] | null
        }
        Update: {
          campo_id?: string | null
          descripcion?: string | null
          dias_para_vencer?: never
          empresa_id?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto?: number | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"] | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_financiero_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rentabilidad_devengada: {
        Row: {
          campo_id: string | null
          empresa_id: string | null
          gastos: number | null
          ingresos: number | null
          mes: string | null
          potrero_id: string | null
          resultado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_financiero_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_financiero_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_potrero: {
        Row: {
          cabezas: number | null
          empresa_id: string | null
          potrero_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "potrero"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      asignar_caravana: {
        Args: {
          p_animal_id: string
          p_categoria?: Database["public"]["Enums"]["categoria_animal"]
          p_numero_rfid: string
          p_numero_visual?: string
          p_pelaje?: string
          p_raza?: string
        }
        Returns: undefined
      }
      auth_empresa_ids: { Args: never; Returns: string[] }
      cambiar_caravana: {
        Args: {
          p_animal_id: string
          p_motivo?: string
          p_nueva_visual?: string
          p_nuevo_rfid: string
        }
        Returns: undefined
      }
      crear_animal: {
        Args: {
          p_categoria: Database["public"]["Enums"]["categoria_animal"]
          p_empresa_id: string
          p_fecha_nacimiento?: string
          p_numero_rfid: string
          p_numero_visual?: string
          p_origen?: string
          p_potrero_id?: string
        }
        Returns: string
      }
      crear_animales_masivo: {
        Args: {
          p_empresa_id: string
          p_items?: Json
          p_lote_id?: string
          p_origen?: string
          p_potrero_id?: string
        }
        Returns: number
      }
      dar_baja_animal: {
        Args: {
          p_animal_id: string
          p_estado: Database["public"]["Enums"]["estado_animal"]
          p_fecha?: string
          p_motivo?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      actividad_movimiento: "cria" | "invernada" | "agricultura" | "estructura"
      agua_estado: "llena" | "normal" | "baja" | "seca"
      aprovechamiento_forraje:
        | "pastoreo"
        | "rollo"
        | "silo"
        | "fardo"
        | "diferido"
      categoria_animal:
        | "vaca"
        | "vaquillona"
        | "novillo"
        | "ternero"
        | "ternera"
        | "toro"
        | "capon"
      destino_campania: "venta" | "consumo"
      electrico_estado: "ok" | "cortado"
      estado_animal: "activo" | "vendido" | "muerto"
      estado_ciclo_potrero:
        | "ganadero"
        | "descanso"
        | "preparacion"
        | "siembra"
        | "cultivo"
        | "cosecha"
        | "rastrojo"
      estado_movimiento: "pendiente" | "liquidado" | "anulado"
      fuente_lluvia: "manual" | "open_meteo"
      medio_pago:
        | "efectivo"
        | "transferencia"
        | "cheque"
        | "mercadopago"
        | "otro"
      pasto_estado: "abundante" | "normal" | "escaso" | "pelado"
      sexo_animal: "macho" | "hembra"
      tipo_campo: "propio" | "alquilado"
      tipo_evento:
        | "alta"
        | "parto"
        | "sanidad"
        | "pesaje"
        | "movimiento"
        | "servicio"
        | "tacto"
        | "destete"
        | "castracion"
        | "cambio_caravana"
        | "baja"
        | "nota"
        | "caravana_asignada"
      tipo_infraestructura: "molino" | "laguna" | "tranquera" | "manga"
      tipo_movimiento: "ingreso" | "gasto"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      actividad_movimiento: ["cria", "invernada", "agricultura", "estructura"],
      agua_estado: ["llena", "normal", "baja", "seca"],
      aprovechamiento_forraje: [
        "pastoreo",
        "rollo",
        "silo",
        "fardo",
        "diferido",
      ],
      categoria_animal: [
        "vaca",
        "vaquillona",
        "novillo",
        "ternero",
        "ternera",
        "toro",
        "capon",
      ],
      destino_campania: ["venta", "consumo"],
      electrico_estado: ["ok", "cortado"],
      estado_animal: ["activo", "vendido", "muerto"],
      estado_ciclo_potrero: [
        "ganadero",
        "descanso",
        "preparacion",
        "siembra",
        "cultivo",
        "cosecha",
        "rastrojo",
      ],
      estado_movimiento: ["pendiente", "liquidado", "anulado"],
      fuente_lluvia: ["manual", "open_meteo"],
      medio_pago: [
        "efectivo",
        "transferencia",
        "cheque",
        "mercadopago",
        "otro",
      ],
      pasto_estado: ["abundante", "normal", "escaso", "pelado"],
      sexo_animal: ["macho", "hembra"],
      tipo_campo: ["propio", "alquilado"],
      tipo_evento: [
        "alta",
        "parto",
        "sanidad",
        "pesaje",
        "movimiento",
        "servicio",
        "tacto",
        "destete",
        "castracion",
        "cambio_caravana",
        "baja",
        "nota",
        "caravana_asignada",
      ],
      tipo_infraestructura: ["molino", "laguna", "tranquera", "manga"],
      tipo_movimiento: ["ingreso", "gasto"],
    },
  },
} as const
