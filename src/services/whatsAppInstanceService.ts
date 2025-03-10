import { io as ioClient } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import { ExternalWebSocketService } from './externalWebSocket';
import NodeCache from 'node-cache';

export class WhatsAppInstanceManager {
    private instances: Map<string, ExternalWebSocketService> = new Map();
    private internalIo: SocketServer;
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly UPDATE_INTERVAL = 180000; // 3 minutos
    private cache: NodeCache = new NodeCache({ stdTTL: 120 }); // 2 minutos de TTL

    constructor(internalIo: SocketServer) {
        this.internalIo = internalIo;
        this.initialize();
    }

    private async initialize() {
        await this.initializeInstances();
        this.startPeriodicCheck();
    }

    private async initializeInstances() {
        try {
            const activeInstances = await prisma.whatsAppInstance.findMany({
                where: {
                    status: 'open'
                }
            });

            for (const instance of activeInstances) {
                await this.createInstanceConnection(instance);
            }

            console.log(`Initialized ${activeInstances.length} WhatsApp instances`);
        } catch (error) {
            console.error('Error initializing WhatsApp instances:', error);
        }
    }

    private startPeriodicCheck() {
        console.log('Iniciando verificação periódica...');
        
        // Garantir que não há outro intervalo rodando
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Criar novo intervalo
        this.checkInterval = setInterval(() => {
            console.log('Executando verificação periódica...');
            this.checkForNewInstances()
                .catch(error => console.error('Erro durante verificação periódica:', error));
        }, this.UPDATE_INTERVAL);

        console.log(`Verificação periódica configurada para cada ${this.UPDATE_INTERVAL / 1000} segundos`);
    }

    private async checkForNewInstances() {
        try {
            console.log('Buscando instâncias no banco de dados...');

            // Verificar se há dados em cache
            const cachedInstances = this.cache.get('activeInstances');
            if (cachedInstances) {
                console.log('Usando instâncias do cache');
                return this.processInstances(cachedInstances as any[]);
            }
            
            const dbInstances = await prisma.whatsAppInstance.findMany({
                where: {
                    status: 'open'
                }
            });

            // Armazenar no cache
            this.cache.set('activeInstances', dbInstances);
            // Processar as instâncias do banco
            return this.processInstances(dbInstances);
        } catch (error) {
            console.error('Erro ao verificar novas instâncias:', error);
        }
    }
    
    private async processInstances(dbInstances: any[]) {
        
        console.log(`Encontradas ${dbInstances.length} instâncias ativas no banco`);
        console.log(`Instâncias atuais em memória: ${Array.from(this.instances.keys()).join(', ')}`);

        // Verificar novas instâncias
        for (const dbInstance of dbInstances) {
            if (!this.instances.has(dbInstance.instanceName)) {
                console.log(`Nova instância encontrada: ${dbInstance.instanceName}`);
                await this.createInstanceConnection(dbInstance);
            } else {
                console.log(`Instância já existente: ${dbInstance.instanceName}`);
            }
        }

        // Verificar instâncias removidas
        const activeInstanceNames = dbInstances.map(i => i.instanceName);
        for (const [instanceName, instance] of this.instances.entries()) {
            if (!activeInstanceNames.includes(instanceName)) {
                console.log(`Instância removida detectada: ${instanceName}`);
                await this.removeInstance(instanceName);
            }
        }

        console.log('Verificação periódica concluída');
    }

    private async createInstanceConnection(instance: {
        instanceName: string;
    }) {
        try {
            const wsService = new ExternalWebSocketService(
                this.internalIo,
                `https://evolution.rubnik.com/${instance.instanceName}`
            );
            
            this.instances.set(instance.instanceName, wsService);
            console.log(`Connected to instance: ${instance.instanceName}`);
            
            return wsService;
        } catch (error) {
            console.error(`Error connecting to instance ${instance.instanceName}:`, error);
            throw error;
        }
    }

    async addInstance(instanceData: {
        instanceName: string;
        serverUrl: string;
        teamId: string;
        agentId: string;
    }) {
        try {
            const newInstance = await prisma.whatsAppInstance.create({
                data: {
                    instanceName: instanceData.instanceName,
                    displayName: instanceData.instanceName.split('-')[0],
                    instanceId: instanceData.instanceName,
                    status: 'open',
                    integration: 'WHATSAPP-BAILEYS',
                    serverUrl: instanceData.serverUrl,
                    teamId: instanceData.teamId,
                    agentId: instanceData.agentId
                }
            });

            await this.createInstanceConnection(newInstance);

            // Atualizar o cache
            const cachedInstances = this.cache.get('activeInstances') as any[] || [];
            cachedInstances.push(newInstance);
            this.cache.set('activeInstances', cachedInstances);

            return newInstance;
        } catch (error) {
            console.error('Error adding WhatsApp instance:', error);
            throw error;
        }
    }

    async removeInstance(instanceName: string) {
        try {
            const instance = this.instances.get(instanceName);
            if (instance) {
                instance.disconnect();
                this.instances.delete(instanceName);

                // await prisma.whatsAppInstance.update({
                //     where: { instanceName },
                //     data: { status: 'closed' }
                // });

                // Atualizar o cache
                const cachedInstances = this.cache.get('activeInstances') as any[] || [];
                const updatedCache = cachedInstances.filter(i => i.instanceName !== instanceName);
                this.cache.set('activeInstances', updatedCache);

                console.log(`Instance ${instanceName} removed successfully`);
            }
        } catch (error) {
            console.error(`Error removing instance ${instanceName}:`, error);
            throw error;
        }
    }

    getActiveInstances() {
        return Array.from(this.instances.keys());
    }

    getInstance(instanceName: string) {
        return this.instances.get(instanceName);
    }

    stopPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('Verificação periódica interrompida');
        }
    }
} 