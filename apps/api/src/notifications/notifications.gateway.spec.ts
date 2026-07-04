import { JwtService } from '@nestjs/jwt';
import { Notification } from '@trimatch/shared';
import { Server, Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';

function fakeSocket(handshake: Partial<Socket['handshake']>): Socket {
  return {
    handshake: { auth: {}, headers: {}, ...handshake },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket;
}

function gatewayWith(jwt: Partial<JwtService>): NotificationsGateway {
  return new NotificationsGateway(jwt as JwtService);
}

const notification = { id: 'n1', recipientId: 'u1' } as unknown as Notification;

describe('NotificationsGateway', () => {
  it('joins the user room and signals ready on a valid handshake token', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ sub: 'u1' });
    const gateway = gatewayWith({ verifyAsync });
    const socket = fakeSocket({ auth: { token: 'good' } });

    await gateway.handleConnection(socket);

    expect(verifyAsync).toHaveBeenCalledWith('good');
    expect(socket.data.userId).toBe('u1');
    expect(socket.join).toHaveBeenCalledWith('u1');
    expect(socket.emit).toHaveBeenCalledWith('ready');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('reads the token from an Authorization header too', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ sub: 'u2' });
    const gateway = gatewayWith({ verifyAsync });
    const socket = fakeSocket({ headers: { authorization: 'Bearer good' } });

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith('u2');
  });

  it('disconnects a handshake with no token', async () => {
    const verifyAsync = jest.fn();
    const gateway = gatewayWith({ verifyAsync });
    const socket = fakeSocket({});

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalled();
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a handshake with an invalid token', async () => {
    const verifyAsync = jest.fn().mockRejectedValue(new Error('bad'));
    const gateway = gatewayWith({ verifyAsync });
    const socket = fakeSocket({ auth: { token: 'bad' } });

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('emits to the recipient room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = gatewayWith({});
    (gateway as unknown as { server: Server }).server = { to } as unknown as Server;

    gateway.emitToUser('u1', notification);

    expect(to).toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenCalledWith('notification', notification);
  });
});
